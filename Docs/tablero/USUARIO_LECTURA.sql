-- =====================================
-- Usuario de solo lectura para Power BI (D28)
-- Lo corre el administrador de Postgres una sola vez, conectado a la base gpa_legal.
-- Solo ve el esquema "tablero": no lee las tablas de la app ni el esquema "tablero_interno"
-- (descuentos y casos sin remuneración, que son de la firma).
-- La API rehace las vistas al arrancar y vuelve a dar estos permisos si el usuario existe.
-- Cambie la contraseña antes de correrlo y guárdela en el gestor de contraseñas de la firma.
-- =====================================

CREATE ROLE tablero_lectura LOGIN PASSWORD 'CAMBIAR-ESTA-CONTRASENA' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER ROLE tablero_lectura SET default_transaction_read_only = on;
ALTER ROLE tablero_lectura CONNECTION LIMIT 5;

GRANT CONNECT ON DATABASE gpa_legal TO tablero_lectura;
REVOKE ALL ON SCHEMA public FROM tablero_lectura;
GRANT USAGE ON SCHEMA tablero TO tablero_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA tablero TO tablero_lectura;

-- Las vistas que se creen después también quedan legibles
ALTER DEFAULT PRIVILEGES IN SCHEMA tablero GRANT SELECT ON TABLES TO tablero_lectura;
