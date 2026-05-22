import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import fs from 'fs/promises';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export const uploadSignature = async (filePath) => {
  const optimized = await sharp(filePath)
    .resize({ width: 800, withoutEnlargement: true })
    .png({ compressionLevel: 8 })
    .toBuffer();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'signatures', resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(optimized);
  });
};

export const uploadPdf = async (buffer) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'deliverynotes', resource_type: 'raw', format: 'pdf', access_mode: 'public' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

export const deleteLocalFile = async (filePath) => {
  try { await fs.unlink(filePath); } catch {}
};
