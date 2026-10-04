import { useEffect } from "react";

/** One observer, finite CSS animations, and fully visible HTML without JavaScript. */
export function usePageMotion(path: string) {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;
    const modestDevice =
      connection?.saveData || navigator.hardwareConcurrency <= 2;
    const elements = [
      ...document.querySelectorAll<HTMLElement>("[data-reveal], [data-motion]"),
    ];
    let observer: IntersectionObserver | undefined;
    const show = (element: HTMLElement) => {
      if (element.hasAttribute("data-reveal")) element.dataset.reveal = "shown";
      if (element.hasAttribute("data-motion")) element.dataset.motion = "shown";
    };
    const setup = () => {
      observer?.disconnect();
      const quiet = reduced.matches || modestDevice;
      document.documentElement.dataset.effects = quiet ? "quiet" : "full";
      if (quiet || !("IntersectionObserver" in window)) {
        elements.forEach(show);
        return;
      }
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              show(entry.target as HTMLElement);
              observer?.unobserve(entry.target);
            }
          }
        },
        { threshold: 0.08 },
      );
      for (const element of elements) {
        if (element.getBoundingClientRect().top < innerHeight) show(element);
        else {
          if (element.hasAttribute("data-reveal"))
            element.dataset.reveal = "pending";
          if (element.hasAttribute("data-motion"))
            element.dataset.motion = "pending";
          observer.observe(element);
        }
      }
    };
    const visibility = () => {
      document.documentElement.dataset.pageVisibility = document.hidden
        ? "hidden"
        : "visible";
    };
    setup();
    visibility();
    reduced.addEventListener("change", setup);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer?.disconnect();
      reduced.removeEventListener("change", setup);
      document.removeEventListener("visibilitychange", visibility);
      elements.forEach(show);
    };
  }, [path]);
}
