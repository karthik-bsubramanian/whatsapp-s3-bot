import express from 'express';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import fetch from 'node-fetch'; 
import { PDFDocument, rgb } from 'pdf-lib';

dotenv.config();

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const isBufferPdf = (buffer) => buffer.toString('utf8', 0, 4) === '%PDF';

const wrapAsPdf = async (buffer) => {
  try {
    const pdfDoc = await PDFDocument.create();

    try {
      const image = await pdfDoc.embedJpg(buffer).catch(() => pdfDoc.embedPng(buffer));
      const page = pdfDoc.addPage([image.width, image.height]);
      page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
      console.log('📸 Wrapped raw image buffer into a new PDF');
    } catch {
      const page = pdfDoc.addPage([600, 400]);
      page.drawText('This file could not be parsed. Uploaded raw content.', {
        x: 50,
        y: 200,
        size: 14,
        color: rgb(0.2, 0.2, 0.2),
      });
      console.log('Could not embed image. Created fallback text PDF');
    }

    return await pdfDoc.save();
  } catch (err) {
    console.error('Failed to wrap buffer as PDF:', err.message);
    return buffer;
  }
};

app.post('/whatsapp-webhook', async (req, res) => {
  const { Body, From, NumMedia, MediaUrl0, MediaContentType0 } = req.body;
  const sender = From.replace('whatsapp:', '');
  const timestamp = Date.now();

  try {
    if (parseInt(NumMedia) > 0) {
      const response = await fetch(MediaUrl0);
      const originalBuffer = await response.buffer();

      const extension = MediaContentType0.split('/')[1];
      let Key = `whatsapp-media/${timestamp}-${sender}.${extension}`;

      let finalBuffer = originalBuffer;

      if (extension === 'pdf') {
        if (isBufferPdf(originalBuffer)) {
          try {
            const pdfDoc = await PDFDocument.load(originalBuffer);
            const cleanPdf = await PDFDocument.create();
            const copiedPages = await cleanPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
            copiedPages.forEach((page) => cleanPdf.addPage(page));
            finalBuffer = await cleanPdf.save();
            console.log('Cleaned PDF before uploading');
          } catch (err) {
            console.warn('Could not clean broken PDF. Wrapping it as image PDF:', err.message);
            finalBuffer = await wrapAsPdf(originalBuffer);
          }
        } else {
          console.warn('Not a real PDF, wrapping it manually');
          finalBuffer = await wrapAsPdf(originalBuffer);
        }
      }

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key,
        Body: finalBuffer,
        ContentType: MediaContentType0,
      }));

      console.log(`Media uploaded: ${Key}`);

      return res.send(`
        <Response>
          <Message>Got your file! Uploaded as ${Key}</Message>
        </Response>
      `);
    } else {
      const Key = `whatsapp-text/${timestamp}-${sender}.txt`;

      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET_NAME,
        Key,
        Body,
        ContentType: 'text/plain',
      }));

      console.log(`Text uploaded: ${Key}`);

      return res.send(`
        <Response>
          <Message>Got your text and saved it!</Message>
        </Response>
      `);
    }
  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('<Response><Message>Oops! Something went wrong</Message></Response>');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Webhook ready at http://localhost:${PORT}`);
});