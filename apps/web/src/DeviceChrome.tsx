import { useEffect, useState } from "react";

function clock(): string {
  const now = new Date();
  return `${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`;
}

/** Status bar, Dynamic Island and home indicator drawn over the app when it
 * is shown as an iPhone on a wide screen. Hidden on real phones (CSS). */
export function DeviceChrome() {
  const [time, setTime] = useState(clock);

  useEffect(() => {
    const id = window.setInterval(() => setTime(clock()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="device-chrome" aria-hidden="true">
      <div className="device-chrome__status">
        <span className="device-chrome__time">{time}</span>
        <span className="device-chrome__island" />
        <span className="device-chrome__icons">
          <svg width="18" height="12" viewBox="0 0 18 12">
            <rect x="0" y="8" width="3" height="4" rx="1" />
            <rect x="5" y="5.5" width="3" height="6.5" rx="1" />
            <rect x="10" y="3" width="3" height="9" rx="1" />
            <rect x="15" y="0" width="3" height="12" rx="1" />
          </svg>
          <svg width="16" height="12" viewBox="0 0 16 12">
            <path d="M8 2.6c2.3 0 4.4.9 6 2.4l1.3-1.4A10.6 10.6 0 0 0 8 .6 10.6 10.6 0 0 0 .7 3.6L2 5c1.6-1.5 3.7-2.4 6-2.4Z" />
            <path d="M8 6.1c1.3 0 2.5.5 3.5 1.3l1.3-1.4A7.2 7.2 0 0 0 8 4.1a7.2 7.2 0 0 0-4.8 1.9l1.3 1.4c1-.8 2.2-1.3 3.5-1.3Z" />
            <path d="M8 9.4c.5 0 .9.2 1.2.5L8 11.4 6.8 9.9c.3-.3.7-.5 1.2-.5Z" />
          </svg>
          <span className="device-chrome__battery">
            <span />
          </span>
        </span>
      </div>
      <span className="device-chrome__home" />
    </div>
  );
}
