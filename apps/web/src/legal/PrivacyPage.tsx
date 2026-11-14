import "../ui/tokens.css";
import "../auth/auth.css";
import "../home/home.css";
import "../owner/explore.css";
import "../owner/owner-glass.css";
import "./legal.css";

/**
 * Public privacy policy at /privacidad. It renders without a session so Google
 * OAuth can leave Testing mode and the consent checkbox has a page to point to.
 * Every data item below is one the web app really sends; anything the code
 * cannot answer (legal entity, contact mailbox, address) stays a placeholder.
 */
export function PrivacyPage() {
  return (
    <div className="auth-scene home">
      <div className="auth-backdrop" aria-hidden="true">
        <div className="auth-backdrop__clouds auth-backdrop__clouds--left" />
        <div className="auth-backdrop__clouds auth-backdrop__clouds--right" />
      </div>

      <main className="home__grid home__grid--screen">
        <div className="home__screen">
          <article className="explore oglass legal">
            <header className="explore__head legal__head">
              <h1 className="explore__title">Política de privacidad</h1>
              <p className="explore__subtitle">
                CanTrack trata tus datos personales conforme a la Ley 1581 de 2012 y al
                Decreto 1377 de 2013 de Colombia. Vigente desde octubre de 2026.
              </p>
            </header>

            <a className="explore__small legal__back" href="/">Volver</a>

            <section className="glass legal__card">
              <h2 className="explore__section">Datos que recogemos</h2>
              <p>Recogemos únicamente los datos que necesitan las pantallas de la app:</p>
              <ul>
                <li>
                  <strong>Cuenta:</strong> nombre completo, correo electrónico, teléfono y
                  contraseña; si entras con Google, Google nos confirma tu identidad y tu correo.
                </li>
                <li>
                  <strong>Perfil del dueño:</strong> foto de perfil, nombre visible, teléfono,
                  punto y etiqueta de recogida (dirección y coordenadas), indicaciones para
                  llegar, forma de entrega de tu perro y método de pago preferido (efectivo,
                  Nequi o tarjeta; no guardamos el número de la tarjeta).
                </li>
                <li>
                  <strong>Perro:</strong> nombre, raza, notas, tamaño, temperamento, energía,
                  si camina con correa, alergias, notas médicas, contacto del veterinario y
                  contacto de emergencia, además de las fotos que subes para reconocerlo.
                </li>
                <li>
                  <strong>Contacto de emergencia y veterinario:</strong> nombre, parentesco y
                  teléfono de la persona a avisar, y nombre y teléfono de tu veterinario.
                </li>
                <li>
                  <strong>Paseos:</strong> solicitudes, ofertas, calificaciones y notas; la
                  ubicación GPS del paseador durante el paseo (puntos de recorrido y posición
                  en tiempo real), que se comparte con el dueño mientras el paseo está activo.
                </li>
                <li>
                  <strong>Paseador:</strong> nombre visible, biografía, zona de servicio,
                  precio por paseo, teléfono, foto de perfil, disponibilidad y ubicación
                  aproximada que envía la app mientras está en línea.
                </li>
                <li>
                  <strong>En tu dispositivo:</strong> guardamos en el almacenamiento local el
                  punto de tu casa y el rol elegido al registrarte, para no pedirlos otra vez.
                </li>
              </ul>
            </section>

            <section className="glass legal__card">
              <h2 className="explore__section">Finalidad del tratamiento</h2>
              <p>Usamos estos datos para:</p>
              <ul>
                <li>Crear y mantener tu cuenta y verificar tu correo.</li>
                <li>Mostrar tu perfil y tus perros, y conectar dueños con paseadores.</li>
                <li>Publicar solicitudes, recibir ofertas y asignar paseos.</li>
                <li>Compartir la ubicación y el avance del paseo con el dueño del perro.</li>
                <li>Poder avisar a tu contacto de emergencia o a tu veterinario si hace falta.</li>
                <li>Calcular tarifas, comisiones y ganancias, y gestionar tu forma de pago.</li>
                <li>Enviar notificaciones del paseo y atender solicitudes de soporte.</li>
                <li>Cumplir obligaciones legales y de seguridad.</li>
              </ul>
            </section>

            <section className="glass legal__card">
              <h2 className="explore__section">Terceros</h2>
              <p>
                Solo compartimos lo necesario con estos proveedores:{" "}
                <strong>Supabase</strong> (autenticación y base de datos),{" "}
                <strong>Google</strong> (inicio de sesión con OAuth),{" "}
                <strong>OpenStreetMap</strong> (mapas y sus tiles),{" "}
                <strong>Ollama Cloud</strong> (revisa con IA que la foto del perro muestre un perro),{" "}
                <strong>Open-Meteo</strong> (clima del punto de recogida, sin tu nombre) y{" "}
                <strong>OSRM</strong> (calcula la ruta a pie entre dos puntos). El paseador asignado ve
                los datos de recogida, tu teléfono y los contactos que registraste mientras
                el paseo está activo. No vendemos tus datos.
              </p>
            </section>

            <section className="glass legal__card">
              <h2 className="explore__section">Derechos</h2>
              <p>
                Como titular de los datos, bajo la Ley 1581 de 2012 puedes <strong>conocer</strong>{" "}
                qué datos tenemos, <strong>actualizar</strong> y <strong>rectificar</strong> los
                que estén desactualizados o incorrectos, y <strong>suprimir</strong> los que no
                deban tratarse. También puedes revocar la autorización que nos diste y
                presentar una queja ante la Superintendencia de Industria y Comercio.
              </p>
              <p>
                Para ejercerlos, escríbenos al correo de contacto de esta página. Atenderemos
                consultas y reclamos en los plazos de la ley. Desde tu perfil puedes
                actualizar tus datos, descargar una copia en JSON y eliminar tu cuenta.
              </p>
            </section>

            <section className="glass legal__card">
              <h2 className="explore__section">Contacto</h2>
              <p>
                Responsable del tratamiento: <strong>[responsable del tratamiento]</strong>.
              </p>
              <p>
                Correo de contacto: <strong>[correo de contacto]</strong>.
              </p>
              <p>
                Dirección: <strong>[dirección]</strong>.
              </p>
            </section>
          </article>
        </div>
      </main>
    </div>
  );
}
