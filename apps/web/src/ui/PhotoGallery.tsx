import { useState } from "react";
import { createPortal } from "react-dom";
import { Sheet } from "./Sheet.js";
import "./photo-gallery.css";

export function PhotoGallery({ photos, name, label, className = "" }: {
  photos: string[]; name: string; label?: string; className?: string;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (photos.length === 0) return null;
  const open = (index: number) => { setFailed(false); setSelected(index); };
  return (
    <>
      <ul className={`photo-gallery ${className}`} aria-label={label ?? `Fotos de referencia de ${name}`}>
        {photos.map((url, index) => (
          <li key={index}>
            <button type="button" className="photo-gallery__thumb" aria-label={`Ampliar foto ${index + 1} de ${name}`} onClick={() => open(index)}>
              <img src={url} alt={`Foto ${index + 1} de ${name}`} loading="lazy" decoding="async" />
            </button>
          </li>
        ))}
      </ul>
      {selected !== null && createPortal(
        <Sheet open title={`Fotos de ${name}`} className="photo-viewer" closeLabel="Cerrar foto" onClose={() => setSelected(null)}>
          {failed ? (
            <div role="alert">
              <p>No pudimos cargar esta foto. Revisa la conexión e inténtalo de nuevo.</p>
              <button type="button" onClick={() => { setAttempt((n) => n + 1); setFailed(false); }}>Reintentar foto</button>
            </div>
          ) : <img key={`${selected}-${attempt}`} className="photo-viewer__image" src={photos[selected]} alt={`Foto ${selected + 1} ampliada de ${name}`} onError={() => setFailed(true)} />}
          <div className="photo-viewer__controls">
            <button type="button" disabled={selected === 0} onClick={() => open(selected - 1)}>Anterior</button>
            <span aria-live="polite">Foto {selected + 1} de {photos.length}</span>
            <button type="button" disabled={selected >= photos.length - 1} onClick={() => open(selected + 1)}>Siguiente</button>
          </div>
        </Sheet>, document.body,
      )}
    </>
  );
}
