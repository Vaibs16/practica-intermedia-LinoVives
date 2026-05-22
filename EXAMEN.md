# F12 — El test como contrato de autorización

## Nota sobre el punto (3) de la Parte 1

El enunciado pide implementar en el controlador la verificación por rol/creador devolviendo 403. Esta lógica **ya estaba implementada en la rama `main` antes de crear la rama `examen`**, concretamente en el commit `91923f1 Update deliverynote.controllers.js`:

```js
const isOwner = note.user._id.toString() === req.user._id.toString();
const isGuest = req.user.role === 'guest';
if (!isOwner && !isGuest) {
  throw AppError.forbidden('No tienes permiso para descargar este albarán');
}
```

Lo que sí se ha añadido en esta rama son los **tests que ejercitan y documentan ese contrato**, que es el objetivo principal del reto.

---

## Respuestas a las preguntas socráticas

### 1. ¿Qué fuga de seguridad queda sin cubrir si no probamos el acceso desde una compañía diferente?

Si todos los tests usan siempre el mismo usuario, solo verificamos que el endpoint *funciona* para el propietario legítimo, pero nunca comprobamos el **aislamiento entre tenants**. La fuga concreta es esta: si por un bug el filtro `company` desapareciera del `findOne`, o si un atacante consiguiera el `_id` de un albarán ajeno (por fuerza bruta de ObjectIds de 24 hex o por una fuga de datos), el test no lo detectaría porque siempre usa la misma compañía. Un test con un segundo usuario de compañía distinta actúa como centinela: si recibe algo distinto de 404, el aislamiento está roto.

### 2. ¿Es suficiente filtrar por `company` para el requisito "solo creador o guest de la misma compañía puede descargar el PDF"?

No. Filtrar por `company` resuelve el **aislamiento entre compañías** (un usuario externo no puede ver el albarán) pero no resuelve la **autorización dentro de la compañía**. El escenario que falla: dos administradores pertenecen a la misma compañía; el administrador B no creó el albarán de A. Con solo el filtro de `company`, B obtiene el PDF de A sin restricción. El requisito exige que dentro de la misma compañía solo el creador (`note.user === req.user._id`) o un usuario con `role: 'guest'` puedan descargarlo. Sin la comprobación adicional de `isOwner || isGuest`, cualquier admin de la compañía tiene acceso indebido.

### 3. ¿En qué endpoint de deliverynote se usa actualmente el campo `role` para tomar una decisión de autorización?

- **`src/routes/deliverynote.routes.js`**: el único middleware aplicado a todas las rutas es `validateUser` (línea 17), que solo verifica que el token sea válido y que el usuario exista. No hay ningún middleware que compruebe el campo `role`.
- **`src/middleware/auth.middleware.js`**: tampoco evalúa `role`; simplemente extrae el usuario del JWT y lo pone en `req.user`.
- El único lugar donde `role` se usa para tomar una decisión es el controlador `getDeliveryNotePdf` (`src/controllers/deliverynote.controllers.js`, líneas 122-126), que distingue entre creador (`isOwner`) y `guest` para decidir si devuelve el PDF o un 403.

### 4. Con el código actual, ¿un atacante que obtiene el `_id` de un albarán ajeno recibe el PDF o un 404? ¿Qué cambio lo protege?

Con el código actual el atacante recibe **404**, porque `DeliveryNote.findOne` filtra también por `company: req.user.company` (línea 114 del controlador). Al pertenecer a una compañía distinta, el documento no se encuentra y se lanza `AppError.notFound`. El filtro de compañía ya actúa como primera línea de defensa frente a la enumeración de IDs.

El cambio de una línea que reforzaría esto (defensa en profundidad) sería añadir el campo `user` al filtro del `findOne`:

```js
// antes
DeliveryNote.findOne({ _id: req.params.id, company: req.user.company, deleted: false })

// después
DeliveryNote.findOne({ _id: req.params.id, company: req.user.company, user: req.user._id, deleted: false })
```

Esto restringiría la búsqueda al creador directamente en la query, aunque eliminaría la posibilidad de que un `guest` vea albaranes que no creó (por eso el código actual hace la comprobación en el controlador, no en la query).

### 5. ¿Deberías aplicar el mock de `storage.service.js` para probar la autorización por rol sin necesidad de Cloudinary?

Sí, y de hecho ya está aplicado. El mock en la línea 9-13 del test intercepta `uploadSignature`, `uploadPdf` y `deleteLocalFile` antes de que se cargue `app.js`, por lo que cualquier test que genere un PDF (incluidos los de autorización) nunca llama a Cloudinary. Para probar la autorización por rol basta con:

1. Mantener el mock activo (ya lo está para todo el fichero).
2. Crear el usuario guest/admin directamente con `User.create` (no hace falta una cuenta real en Cloudinary).
3. Hacer la petición con el token del usuario de prueba y verificar el código de respuesta.

Esto es exactamente lo que hacen los tests nuevos: crean usuarios en la BD en memoria, obtienen un JWT real del endpoint `/api/user/login` y ejercitan el controlador completo sin ninguna dependencia externa.

---

## Autenticación vs. Autorización, y el patrón para generalizar

### Diferencia entre autenticación y autorización

- **Autenticación** responde a *¿quién eres?*: verifica la identidad del usuario comprobando el JWT (en `auth.middleware.js`). Si el token es válido y el usuario existe en la BD, la autenticación pasa.
- **Autorización** responde a *¿qué puedes hacer?*: una vez identificado el usuario, decide si tiene permiso para operar sobre un recurso concreto. En este endpoint, la autorización comprueba si el usuario es el creador del albarán o tiene rol `guest`.

Un usuario puede estar correctamente autenticado (token válido) y aun así no estar autorizado a acceder a un recurso (recibe 403).

### Por qué filtrar por `company` no es suficiente para la autorización por rol

Filtrar por `company` es **autorización de tenant** (aislamiento entre organizaciones), no **autorización de rol** (permisos dentro de una organización). Son dos niveles distintos:

| Nivel | Pregunta | Implementación |
|-------|----------|----------------|
| Tenant | ¿Pertenece este recurso a tu organización? | `findOne({ company: req.user.company })` |
| Rol/creador | ¿Tienes permiso dentro de tu organización? | `isOwner \|\| isGuest` en el controlador |

Sin el segundo nivel, cualquier admin de la compañía puede ver los albaranes de sus compañeros, lo que viola el principio de mínimo privilegio.

### Patrón para generalizar la comprobación a otros endpoints

En lugar de repetir la lógica `isOwner || isGuest` en cada controlador, se puede extraer a un middleware de autorización parametrizable:

```js
// src/middleware/authorize.middleware.js
export const authorizeOwnerOrRole = (allowedRoles) => (req, res, next) => {
  const resource = req.resource; // se coloca en req por un middleware previo
  const isOwner = resource.user.toString() === req.user._id.toString();
  const hasRole = allowedRoles.includes(req.user.role);
  if (!isOwner && !hasRole) throw AppError.forbidden();
  next();
};
```

Y en la ruta:
```js
router.get('/pdf/:id', loadDeliveryNote, authorizeOwnerOrRole(['guest']), getDeliveryNotePdf);
```

`loadDeliveryNote` pondría el documento en `req.resource`; `authorizeOwnerOrRole` haría la comprobación de forma reutilizable.

---

## Proceso

| Campo | Detalle |
|-------|---------|
| Tiempo total | ~45 minutos |
| Herramientas | Claude Code (análisis del código existente, generación de tests y EXAMEN.md), editor de código |
| Prompts principales | "ayudame a hacer esto, poco a poco: Reto F12..." — el prompt completo del enunciado |
| Lo que hice yo | Revisé que los tests nuevos cubrieran los tres contratos (404 compañía distinta, 403 admin ajeno, 200 guest), entendí por qué la verificación ya estaba en el controlador y expliqué con mis propias palabras la diferencia entre los dos niveles de autorización |
