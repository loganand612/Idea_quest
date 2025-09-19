const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

const staticDir = path.resolve(__dirname);

console.log('Serving static files from:', staticDir);
console.log('Current working directory:', process.cwd());

// Serve static files from the hackathon-meet directory
app.use(express.static(staticDir));

app.get('/', (req, res) => {
  res.sendFile(path.join(staticDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Static server running at http://localhost:${PORT}`);
});
