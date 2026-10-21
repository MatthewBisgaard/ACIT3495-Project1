import express from 'express';
import routes from './routes.js';

const app = express();
app.use(express.json());
app.use(routes);

// Any error thrown in a route (e.g. database down) ends up here
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.message);
  res.status(500).json({ error: 'internal error' });
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`auth listening on ${port}`));