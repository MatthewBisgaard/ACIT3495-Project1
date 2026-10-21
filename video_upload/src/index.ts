import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import routes from './routes.js';

const app = express();
app.disable('x-powered-by');
app.use(cookieParser());
app.use(express.json());
app.use(express.static('public')); // the upload page
app.use(routes);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return void res.status(status).json({ error: err.message });
  }
  console.error(err.message);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`video_upload listening on ${port}`));