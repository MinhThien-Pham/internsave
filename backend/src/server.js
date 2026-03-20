const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const applicationsRouter = require('./routes/applications');

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'internsave-api' });
});

app.use('/api/applications', applicationsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(port, () => {
  console.log(`InternSave API running on http://localhost:${port}`);
});
