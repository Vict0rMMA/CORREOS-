import { Plane } from "lucide-react";

/**
 * Cielo de fondo: aviones lejanos cruzando la pantalla con su estela.
 *
 * Es decorativo y no debe distraer: va detras de todo, sin capturar el raton,
 * con poca opacidad y muy lento. Con "reducir movimiento" activado se oculta
 * por completo (ver .ambient-sky en globals.css).
 */

interface Cloud {
  top: string;
  left: string;
  width: string;
  height: string;
  duration: string;
  delay: string;
}

/** Nubes muy difuminadas: dan profundidad sin ensuciar el fondo. */
const CLOUDS: Cloud[] = [
  { top: "-4%", left: "8%", width: "38vw", height: "22vw", duration: "70s", delay: "0s" },
  { top: "38%", left: "58%", width: "44vw", height: "26vw", duration: "95s", delay: "-30s" },
  { top: "76%", left: "-6%", width: "34vw", height: "20vw", duration: "82s", delay: "-15s" },
];

interface Flight {
  /** Altura en la pantalla. */
  top: string;
  /** Duracion del cruce. */
  duration: string;
  /** Retraso inicial, para que no salgan todos a la vez. */
  delay: string;
  size: string;
  opacity: number;
  /** Vuela de derecha a izquierda. */
  back?: boolean;
}

const FLIGHTS: Flight[] = [
  { top: "11%", duration: "72s", delay: "-10s", size: "15px", opacity: 0.22 },
  { top: "34%", duration: "108s", delay: "-46s", size: "11px", opacity: 0.16, back: true },
  { top: "58%", duration: "88s", delay: "-26s", size: "17px", opacity: 0.2 },
  { top: "83%", duration: "128s", delay: "-70s", size: "12px", opacity: 0.14, back: true },
];

export function AmbientSky() {
  return (
    <div className="ambient-sky print-hidden" aria-hidden>
      {CLOUDS.map((cloud) => (
        <span
          key={cloud.left}
          className="ambient-cloud"
          style={{
            top: cloud.top,
            left: cloud.left,
            width: cloud.width,
            height: cloud.height,
            animationDuration: cloud.duration,
            animationDelay: cloud.delay,
          }}
        />
      ))}

      {FLIGHTS.map((flight) => (
        <span
          key={flight.top}
          className={`ambient-plane text-accent${flight.back ? " ambient-plane-back" : ""}`}
          style={{
            top: flight.top,
            animationDuration: flight.duration,
            animationDelay: flight.delay,
            opacity: flight.opacity,
          }}
        >
          <span className="ambient-trail" />
          <Plane className="rotate-45" style={{ width: flight.size, height: flight.size }} />
        </span>
      ))}
    </div>
  );
}
