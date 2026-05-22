import { jest } from '@jest/globals';
import request from 'supertest';
import User from '../src/models/User.js';
import Company from '../src/models/Company.js';
import DeliveryNote from '../src/models/DeliveryNote.js';
import bcrypt from 'bcryptjs';

// Mock de Cloudinary para que el endpoint de firma funcione sin credenciales reales
jest.unstable_mockModule('../src/services/storage.service.js', () => ({
  uploadSignature: jest.fn().mockResolvedValue('https://fake.cloudinary.com/test/signature.webp'),
  uploadPdf: jest.fn().mockResolvedValue('https://fake.cloudinary.com/test/albaran.pdf'),
  deleteLocalFile: jest.fn().mockResolvedValue(undefined)
}));

// app debe importarse después del mock para que el módulo
// ya esté registrado cuando los controladores carguen storage.service.js
const { default: app } = await import('../src/app.js');

let token;
let clientId;
let projectId;
let companyId;

const userData = {
  email: 'note-test@bildy.com',
  password: 'Password123!',
  name: 'Test',
  lastName: 'User',
  nif: '12345678A'
};

const noteHours = {
  format: 'hours',
  description: 'Trabajo de fontanería',
  workDate: '2025-06-01',
  hours: 8
};

const noteMaterial = {
  format: 'material',
  description: 'Entrega de material',
  workDate: '2025-06-01',
  material: 'Cemento',
  quantity: 10,
  unit: 'sacos'
};

beforeEach(async () => {
  const hashedPassword = await bcrypt.hash(userData.password, 10);
  const user = await User.create({ ...userData, password: hashedPassword, status: 'verified' });
  const company = await Company.create({ name: 'Test Company', cif: 'A00000000', owner: user._id });
  user.company = company._id;
  companyId = company._id;
  await user.save();

  const loginRes = await request(app)
    .post('/api/user/login')
    .send({ email: userData.email, password: userData.password });
  token = loginRes.body.accessToken;

  const clientRes = await request(app)
    .post('/api/client')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Cliente Test', cif: 'B12345678' });
  clientId = clientRes.body.data._id;

  const projectRes = await request(app)
    .post('/api/project')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Proyecto Test', projectCode: 'PRJ-001', client: clientId });
  projectId = projectRes.body.data._id;
});

// POST /api/deliverynote

describe('POST /api/deliverynote', () => {
  test('crea un albarán de horas', async () => {
    const res = await request(app)
      .post('/api/deliverynote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });

    expect(res.status).toBe(201);
    expect(res.body.data.format).toBe('hours');
  });

  test('crea un albarán de material', async () => {
    const res = await request(app)
      .post('/api/deliverynote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...noteMaterial, project: projectId, client: clientId });

    expect(res.status).toBe(201);
    expect(res.body.data.format).toBe('material');
  });

  test('falla si el proyecto no existe', async () => {
    const res = await request(app)
      .post('/api/deliverynote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: '000000000000000000000000', client: clientId });

    expect(res.status).toBe(404);
  });

  test('falla si el cliente no corresponde al proyecto', async () => {
    const otroCliente = await request(app)
      .post('/api/client')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Otro Cliente', cif: 'X99999999' });
    const otroClienteId = otroCliente.body.data._id;

    const res = await request(app)
      .post('/api/deliverynote')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: otroClienteId });

    expect(res.status).toBe(400);
  });

  test('falla sin token', async () => {
    const res = await request(app)
      .post('/api/deliverynote')
      .send({ ...noteHours, project: projectId, client: clientId });

    expect(res.status).toBe(401);
  });
});

// GET /api/deliverynote

describe('GET /api/deliverynote', () => {
  test('lista los albaranes con paginación', async () => {
    await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });

    const res = await request(app).get('/api/deliverynote').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.totalItems).toBe(1);
  });

  test('filtra por formato', async () => {
    await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteMaterial, project: projectId, client: clientId });

    const res = await request(app)
      .get('/api/deliverynote?format=hours')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });

  test('filtra por proyecto', async () => {
    await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });

    const res = await request(app)
      .get(`/api/deliverynote?project=${projectId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('filtra por firmados', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    await DeliveryNote.findByIdAndUpdate(created.body.data._id, { signed: true });

    const res = await request(app)
      .get('/api/deliverynote?signed=true')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].signed).toBe(true);
  });

  test('falla sin token', async () => {
    const res = await request(app).get('/api/deliverynote');
    expect(res.status).toBe(401);
  });
});

// GET /api/deliverynote/:id

describe('GET /api/deliverynote/:id', () => {
  test('obtiene un albarán por id con populate', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    const id = created.body.data._id;

    const res = await request(app).get(`/api/deliverynote/${id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.client.name).toBeDefined();
    expect(res.body.data.project.name).toBeDefined();
  });

  test('devuelve 404 si no existe', async () => {
    const res = await request(app)
      .get('/api/deliverynote/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('falla sin token', async () => {
    const res = await request(app).get('/api/deliverynote/000000000000000000000000');
    expect(res.status).toBe(401);
  });
});

// GET /api/deliverynote/pdf/:id

describe('GET /api/deliverynote/pdf/:id', () => {
  test('genera y devuelve el PDF de un albarán', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    const id = created.body.data._id;

    const res = await request(app)
      .get(`/api/deliverynote/pdf/${id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('redirige a pdfUrl si el albarán ya está firmado y tiene PDF en la nube', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    await DeliveryNote.findByIdAndUpdate(created.body.data._id, {
      signed: true,
      pdfUrl: 'https://fake.cloudinary.com/test/albaran.pdf'
    });

    const res = await request(app)
      .get(`/api/deliverynote/pdf/${created.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('https://fake.cloudinary.com/test/albaran.pdf');
  });

  test('devuelve 404 si no existe', async () => {
    const res = await request(app)
      .get('/api/deliverynote/pdf/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('falla sin token', async () => {
    const res = await request(app).get('/api/deliverynote/pdf/000000000000000000000000');
    expect(res.status).toBe(401);
  });

  test('usuario de otra compañía recibe 404 al intentar descargar el PDF', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    const noteId = created.body.data._id;

    const hashedPassword = await bcrypt.hash('Password123!', 10);
    const otherUser = await User.create({
      email: 'other-company@bildy.com',
      password: hashedPassword,
      name: 'Other',
      lastName: 'User',
      nif: '87654321B',
      status: 'verified'
    });
    const otherCompany = await Company.create({ name: 'Other Company', cif: 'B99999999', owner: otherUser._id });
    otherUser.company = otherCompany._id;
    await otherUser.save();

    const loginRes = await request(app)
      .post('/api/user/login')
      .send({ email: 'other-company@bildy.com', password: 'Password123!' });
    const otherToken = loginRes.body.accessToken;

    const res = await request(app)
      .get(`/api/deliverynote/pdf/${noteId}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(404);
  });

  test('admin de la misma compañía que no es el creador recibe 403', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    const noteId = created.body.data._id;

    const hashedPassword = await bcrypt.hash('Password123!', 10);
    await User.create({
      email: 'other-admin@bildy.com',
      password: hashedPassword,
      name: 'Other',
      lastName: 'Admin',
      nif: '22222222D',
      role: 'admin',
      status: 'verified',
      company: companyId
    });

    const loginRes = await request(app)
      .post('/api/user/login')
      .send({ email: 'other-admin@bildy.com', password: 'Password123!' });
    const otherAdminToken = loginRes.body.accessToken;

    const res = await request(app)
      .get(`/api/deliverynote/pdf/${noteId}`)
      .set('Authorization', `Bearer ${otherAdminToken}`);

    expect(res.status).toBe(403);
  });

  test('usuario con role guest de la misma compañía puede descargar el PDF (200)', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    const noteId = created.body.data._id;

    const hashedPassword = await bcrypt.hash('Password123!', 10);
    await User.create({
      email: 'guest@bildy.com',
      password: hashedPassword,
      name: 'Guest',
      lastName: 'User',
      nif: '11111111C',
      role: 'guest',
      status: 'verified',
      company: companyId
    });

    const loginRes = await request(app)
      .post('/api/user/login')
      .send({ email: 'guest@bildy.com', password: 'Password123!' });
    const guestToken = loginRes.body.accessToken;

    const res = await request(app)
      .get(`/api/deliverynote/pdf/${noteId}`)
      .set('Authorization', `Bearer ${guestToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });
});

// PATCH /api/deliverynote/:id/sign

describe('PATCH /api/deliverynote/:id/sign', () => {
  test('firma un albarán correctamente', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    const id = created.body.data._id;
    const fakeImage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    const res = await request(app)
      .patch(`/api/deliverynote/${id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .attach('signature', fakeImage, { filename: 'firma.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.signed).toBe(true);
    expect(res.body.data.signatureUrl).toBeDefined();
  });

  test('falla si el albarán ya está firmado', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    await DeliveryNote.findByIdAndUpdate(created.body.data._id, { signed: true });
    const fakeImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const res = await request(app)
      .patch(`/api/deliverynote/${created.body.data._id}/sign`)
      .set('Authorization', `Bearer ${token}`)
      .attach('signature', fakeImage, { filename: 'firma.png', contentType: 'image/png' });

    expect(res.status).toBe(400);
  });

  test('falla si no se envía imagen de firma', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });

    const res = await request(app)
      .patch(`/api/deliverynote/${created.body.data._id}/sign`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('devuelve 404 si el albarán no existe', async () => {
    const fakeImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const res = await request(app)
      .patch('/api/deliverynote/000000000000000000000000/sign')
      .set('Authorization', `Bearer ${token}`)
      .attach('signature', fakeImage, { filename: 'firma.png', contentType: 'image/png' });

    expect(res.status).toBe(404);
  });

  test('falla sin token', async () => {
    const res = await request(app)
      .patch('/api/deliverynote/000000000000000000000000/sign');

    expect(res.status).toBe(401);
  });
});

// DELETE /api/deliverynote/:id

describe('DELETE /api/deliverynote/:id', () => {
  test('elimina un albarán no firmado', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });

    const res = await request(app)
      .delete(`/api/deliverynote/${created.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  test('no permite borrar un albarán firmado', async () => {
    const created = await request(app).post('/api/deliverynote').set('Authorization', `Bearer ${token}`)
      .send({ ...noteHours, project: projectId, client: clientId });
    await DeliveryNote.findByIdAndUpdate(created.body.data._id, { signed: true });

    const res = await request(app)
      .delete(`/api/deliverynote/${created.body.data._id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });

  test('devuelve 404 si no existe', async () => {
    const res = await request(app)
      .delete('/api/deliverynote/000000000000000000000000')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });

  test('falla sin token', async () => {
    const res = await request(app).delete('/api/deliverynote/000000000000000000000000');
    expect(res.status).toBe(401);
  });
});
