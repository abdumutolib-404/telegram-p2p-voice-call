import { Router, Request, Response } from 'express';
import { WebhookReceiver, EgressStatus, EgressInfo } from 'livekit-server-sdk';
import { env } from '../config/env';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export const livekitWebhookRouter = Router();

function getWebhookReceiver(): WebhookReceiver {
  return new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
}

livekitWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || (req.headers.authorize as string);
  const rawBody = Buffer.isBuffer(req.body)
    ? req.body.toString('utf-8')
    : typeof req.body === 'string'
    ? req.body
    : JSON.stringify(req.body);

  let event: any;
  try {
    const receiver = getWebhookReceiver();
    event = await receiver.receive(rawBody, authHeader);
  } catch (err: unknown) {
    logger.warn('LiveKit webhook auth validation failed', {
      service: 'livekit',
      event: 'webhook_auth_failed',
    }, err);
    res.status(401).send('Unauthorized webhook signature');
    return;
  }

  const eventName = event.event;
  const egressInfo: EgressInfo | undefined = event.egressInfo;

  if (!egressInfo) {
    res.status(200).send('OK');
    return;
  }

  const egressId = egressInfo.egressId;
  const roomName = egressInfo.roomName;
  const status = egressInfo.status;

  logger.info('LiveKit webhook event received', {
    service: 'livekit',
    event: 'webhook_event_received',
    webhookEvent: eventName,
    egressId,
    roomName,
    status,
  });

  try {
    // Session lookup: egressId is the primary identifier for egress lifecycle events.
    // roomName (generated as a cryptographically unique UUID) is used as a fallback for egress_started where egressId may not yet be persisted.
    const session = await prisma.callSession.findFirst({
      where: {
        OR: [
          ...(egressId ? [{ egressId }] : []),
          ...(roomName ? [{ roomName }] : []),
        ],
      },
    });

    if (!session) {
      logger.warn('LiveKit webhook session not found', {
        service: 'livekit',
        event: 'webhook_session_not_found',
        egressId,
        roomName,
      });
      res.status(200).send('OK');
      return;
    }

    if (eventName === 'egress_started') {
      await prisma.callSession.update({
        where: { id: session.id },
        data: {
          status: session.status,
          egressId,
        },
      });
      logger.info('LiveKit recording active', {
        service: 'livekit',
        event: 'recording_active',
        sessionId: session.id,
        egressId,
      });
    } else if (eventName === 'egress_ended') {
      if (status === EgressStatus.EGRESS_COMPLETE) {
        const fileResult = egressInfo.fileResults?.[0];
        const storageKey = fileResult?.filename || session.recordingUrl;
        const size = fileResult?.size ? Number(fileResult.size) : 0;
        const duration = fileResult?.duration ? Number(fileResult.duration) : null;

        // F5 Fix: Reject zero-byte or missing egress results so empty files do not consume quota
        if (!fileResult || !size || size <= 0) {
          logger.warn('LiveKit recording ended with empty result', {
            service: 'livekit',
            event: 'recording_empty_result',
            sessionId: session.id,
            egressId,
            status,
            size,
            storageKey,
          });

          await prisma.callSession.update({
            where: { id: session.id },
            data: {
              recordingUrl: null,
            },
          });
        } else {
          await prisma.callSession.update({
            where: { id: session.id },
            data: {
              egressId,
              recordingUrl: storageKey,
            },
          });

          logger.info('LiveKit recording completed', {
            service: 'livekit',
            event: 'recording_completed',
            sessionId: session.id,
            egressId,
            storageKey,
            size,
            duration,
          });
        }
      } else {
        logger.warn('LiveKit recording failed', {
          service: 'livekit',
          event: 'recording_failed',
          sessionId: session.id,
          egressId,
          status,
          error: egressInfo.error,
        });

        await prisma.callSession.update({
          where: { id: session.id },
          data: {
            recordingUrl: null,
          },
        });
      }
    }
  } catch (dbErr: unknown) {
    // F6 Fix: Return 500 on database failure so LiveKit retries delivery via exponential backoff
    logger.error('LiveKit webhook database update failed', {
      service: 'livekit',
      event: 'webhook_db_update_failed',
    }, dbErr);
    res.status(500).send('Database update failed');
    return;
  }

  res.status(200).send('OK');
});
