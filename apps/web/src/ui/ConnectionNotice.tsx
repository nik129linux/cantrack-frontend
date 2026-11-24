import { useEffect, useState } from "react";

export function ConnectionNotice() {
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener("offline", update);
    window.addEventListener("online", update);
    return () => {
      window.removeEventListener("offline", update);
      window.removeEventListener("online", update);
    };
  }, []);
  return offline ? <p className="home__connection" role="status">Sin conexión. Puedes revisar los datos cargados; reintenta los envíos cuando vuelva la conexión.</p> : null;
}
