import express from 'express';
import { mkdirSync } from 'node:fs';
import routes, { DATA_DIR } from './routes.js';

mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.disable('x-powered-by');
app.use(routes); // no express.json(): bodies here are raw video streams

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`storage listening on ${port}, saving to ${DATA_DIR}`));