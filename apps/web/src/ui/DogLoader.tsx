import "./dog-loader.css";

type DogLoaderProps = {
  /** Visible text under the dog; also what screen readers announce. */
  label: string;
};

/**
 * Loading indicator: the white dog gallops in place. The two walking frames
 * cross-fade (a soft motion blur) while the body arcs through the air, a shadow
 * breathes under it, and grass, dust and speed lines stream past.
 */
export function DogLoader({ label }: DogLoaderProps) {
  return (
    <div className="dog-loader" role="status">
      <div className="dog-loader__scene" aria-hidden="true">
        <span className="dog-loader__speed dog-loader__speed--1" />
        <span className="dog-loader__speed dog-loader__speed--2" />
        <span className="dog-loader__speed dog-loader__speed--3" />
        <span className="dog-loader__grass" />
        <span className="dog-loader__ground" />
        <span className="dog-loader__shadow" />
        <span className="dog-loader__dust dog-loader__dust--1" />
        <span className="dog-loader__dust dog-loader__dust--2" />
        <span className="dog-loader__dust dog-loader__dust--3" />
        <span className="dog-loader__dust dog-loader__dust--4" />
        <span className="dog-loader__dog">
          <span className="dog-loader__body">
            <img
              className="dog-loader__frame dog-loader__frame--a"
              src="/art/characters/dog-walk-a.webp"
              alt=""
              draggable={false}
            />
            <img
              className="dog-loader__frame dog-loader__frame--b"
              src="/art/characters/dog-walk-b.webp"
              alt=""
              draggable={false}
            />
          </span>
        </span>
      </div>
      <p className="dog-loader__label">{label}</p>
    </div>
  );
}

