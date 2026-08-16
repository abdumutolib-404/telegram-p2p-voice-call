import { Router, Request, Response } from 'express';
import { WebhookReceiver, EgressStatus, EgressInfo } from 'livekit-server-sdk';
import { env } from '../config/env';
import { prisma } from '../config/database';

export const livekitWebhookRouter = Router();

const webhookReceiver = new WebhookReceiver(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

livekitWebhookRouter.post('/webhook', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization || (req.headers.authorize as string);
  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

  let event: any;
  try {
    event = await webhookReceiver.receive(rawBody, authHeader);
  } catch (err: unknown) {
    console.warn('[LiveKit Webhook] auth_validation_failed:', err instanceof Error ? err.message : err);
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

  console.log('[LiveKit Webhook] EVENT_RECEIVED', {
    event: eventName,
    egressId,
    roomName,
    status,
  });

  try {
    const session = await prisma.callSession.findFirst({
      where: {
        OR: [
          { egressId },
          { roomName },
        ],
      },
    });

    if (!session) {
      console.warn('[LiveKit Webhook] session_not_found', { egressId, roomName });
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
      console.log('[LiveKit Webhook] RECORDING_ACTIVE', { sessionId: session.id, egressId });
    } else if (eventName === 'egress_ended') {
      if (status === EgressStatus.EGRESS_COMPLETE) {
        const fileResult = egressInfo.fileResults?.[0];
        const storageKey = fileResult?.filename || session.recordingUrl;
        const size = fileResult?.size ? Number(fileResult.size) : null;
        const duration = fileResult?.duration ? Number(fileResult.duration) : null;

        await prisma.callSession.update({
          where: { id: session.id },
          data: {
            egressId,
            recordingUrl: storageKey,
          },
        });

        console.log('[LiveKit Webhook] RECORDING_COMPLETED', {
          sessionId: session.id,
          egressId,
          storageKey,
          size,
          duration,
        });
      } else {
        console.warn('[LiveKit Webhook] RECORDING_FAILED', {
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
    console.error('[LiveKit Webhook] db_update_failed', dbErr);
  }

  res.status(200).send('OK');
});
