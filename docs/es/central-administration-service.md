# Servicio privado de administración

[English](../central-administration-service.md)

El Worker alojado de Diagrams exporta el punto de entrada `Administration` para la administración
central de la familia. Reutiliza los handlers, permisos, base de datos y registro administrativo
de Diagrams. La interfaz es un service binding privado de Cloudflare; no hay una URL pública del puente.

## Binding y autenticación

El Worker de identidad vincula producción explícitamente:

```json
{
  "services": [
    {
      "binding": "DIAGRAMS_ADMIN",
      "service": "meltemi-diagrams-cloud",
      "entrypoint": "Administration"
    }
  ]
}
```

Usa otro binding a `meltemi-diagrams-staging` para staging. La URL de la solicitud debe usar el
origen configurado exacto del entorno vinculado: `https://diagrams.meltemi.dev` o
`https://staging.diagrams.meltemi.dev`. Se rechazan las credenciales en la URL, parámetros de
consulta, fragmentos y otros orígenes. El punto de entrada no reenvía destinos ni cabeceras del llamador.

Cada llamada necesita `Authorization: Bearer <Meltemi session JWT>`, con un máximo de 4096 caracteres.
Es la sesión de identidad existente de la persona, no un token `mdg_` de API ni otra credencial
de servicio. El adaptador comprueba firma, emisor, audiencia, vencimiento y estado vigente de la
sesión en cada llamada. Rechaza una sesión revocada o que no pueda confirmar, también en desarrollo.
Las cookies, Origin, Host, identificadores de cuenta y cabeceras de rol del llamador no sustituyen
esta autenticación.

Antes de llamar al binding por una acción del navegador, la interfaz central de identidad debe
comprobar su sesión vigente, Origin propio y CSRF con alcance. El adaptador reconstruye una
solicitud de cookie del origen propio desde la sesión validada y la delega a Diagrams. Los roles
existentes siguen decidiendo cada acción.

## Contexto y operaciones

`GET /context` devuelve solo esta estructura:

```json
{
  "role": "invitee",
  "invitation": {
    "id": "0123456789abcdef0123456789abcdef",
    "invitedBy": { "name": "Owner" },
    "expiresAt": "2026-11-12T12:00:00.000Z"
  }
}
```

El rol del contexto es `owner`, `admin`, `invitee` o `none`; `invitation` es null salvo cuando
existe una invitación pendiente válida. Esta consulta no expone perfil, email, identificador de
sesión, token, permisos efectivos ni consumo. `GET /api/admin` conserva sus nombres de rol
existentes, `owner` o `administrator`. La ruta subyacente `/api/session` no está disponible por
este punto de entrada.

| Método y ruta privada                                        | Cuerpo                                                  | Resultado y acceso existentes                                                                                                                                     |
| ------------------------------------------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /context`                                               | Ninguno                                                 | Contexto mínimo para cualquier sesión válida                                                                                                                      |
| `POST /account-permission`                                   | `{ "account": "…", "permission": "unbranded-exports" }` | Consulta de permiso de una cuenta; propietario o administrador                                                                                                    |
| `GET /api/admin`                                             | Ninguno                                                 | Rol, propietarios, administradores, invitaciones visibles para el propietario, titulares de permisos, últimas 50 acciones, host publicado y últimas 50 donaciones |
| `POST /api/admin/invitations`                                | `{ "email": "…" }`                                      | El propietario invita; 201 nueva, 200 ya pendiente                                                                                                                |
| `DELETE /api/admin/invitations/<id>`                         | Ninguno                                                 | El propietario revoca; 204                                                                                                                                        |
| `POST /api/admin/invitations/<id>/accept`                    | Ninguno                                                 | El destinatario verificado acepta; 204                                                                                                                            |
| `POST /api/admin/invitations/<id>/decline`                   | Ninguno                                                 | El destinatario verificado rechaza; 204                                                                                                                           |
| `DELETE /api/admin/administrators/<sub>`                     | Ninguno                                                 | El propietario elimina un administrador invitado o el administrador abandona; 204                                                                                 |
| `GET /api/admin/permissions/<permission>`                    | Ninguno                                                 | Titulares del permiso; propietario o administrador                                                                                                                |
| `GET /api/admin/accounts/<account>/permissions/<permission>` | Ninguno                                                 | Consulta existente de permiso de cuenta; propietario o administrador                                                                                              |
| `PUT /api/admin/accounts/<account>/permissions/<permission>` | `{ "granted": true }` o `{ "granted": false }`          | Conceder o revocar; propietario o administrador                                                                                                                   |
| `DELETE /api/admin/publications/<handle>/<slug>`             | `{ "reason": "…" }` opcional                            | Retirada; propietario o administrador; 204                                                                                                                        |

Usa la URL constante `POST /account-permission` para consultar: así el email o identificador de
cuenta viaja en el cuerpo y no en una URL de invocación del servicio. El cuerpo debe contener
exactamente las dos cadenas no vacías `account` y `permission`. El adaptador las codifica y llama
internamente al handler GET existente. Una vez resuelta la cuenta, usa el `sub` devuelto para
actualizar permisos. El único permiso actual es `unbranded-exports`; la consulta acepta sub,
`@handle` o email verificado según las reglas existentes. No hay un endpoint que liste cuentas.

## Validación y respuestas

Los cuerpos no vacíos deben ser objetos JSON UTF-8, con tipo de contenido JSON y un máximo de
8192 bytes. Las solicitudes GET no llevan cuerpo. Cada operación conserva su validación de
campos, roles y límites: diez invitaciones administrativas pendientes, veinte administradores
invitados, emails verificados de destinatarios y motivos de un máximo de 500 caracteres. Las
mutaciones exitosas conservan su registro transaccional existente.

| Fallo                                                                                      | Respuesta                          |
| ------------------------------------------------------------------------------------------ | ---------------------------------- |
| Sesión ausente, inválida, falsificada, vencida, revocada o que no puede confirmarse        | `401 auth.required`                |
| Método o ruta no admitidos, separador codificado, consulta u origen del entorno incorrecto | `404 not-found`                    |
| Cuerpo excesivo, mal formado o inválido                                                    | `400 request.invalid`              |
| Rol existente insuficiente o destinatario de invitación incorrecto                         | `404 not-found` existente          |
| Límite de invitaciones, administrador existente, cuenta ambigua u otro fallo de negocio    | Estado y código estable existentes |

Los errores tienen la estructura habitual `{ code, message }`. Datos y errores usan
`Cache-Control: no-store`. No registres tokens bearer, cookies, cuerpos, datos privados de
donaciones ni texto de consulta de cuentas. El handler público predeterminado no selecciona
el adaptador privado mediante cabeceras ni rutas.

## Entornos y entrega coordinada

El servicio opera sobre la configuración y almacenamiento del Worker vinculado. Un binding de
staging no puede apuntar al origen de producción. El Worker local de Docker no exporta
`Administration` y mantiene la administración alojada no disponible; no añade dependencias de
identidad ni service bindings.

Entrega el backend privado antes de habilitar la integración Web central. Los cambios de la
interfaz del panel de cuenta alojado se coordinan por separado, una vez verificados ambos
servicios. Este contrato no añade mutaciones de propietarios de `ADMIN_SUBS`, configuración de
despliegue, secretos, cuotas ni facturación; siguen gestionados por sus contratos existentes de
configuración e infraestructura.
