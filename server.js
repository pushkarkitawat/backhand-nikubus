
const express = require("express");
const cors = require("cors");
const dashboard = require('./routes/dashboard');
const booking = require('./routes/booking');
const login = require('./routes/login');
const app = express();
app.use(cors());
app.use(express.json());



// 🔥 USE ROUTES
app.use('/api/dashboard', dashboard);
app.use('/api/booking', booking);
app.use('/api', login);
app.get('/bb', (req, res) => {
    res.send('Transport Admin Backend Running45 🚚');
  });
  console.log("=== ENV DEBUG ===");
console.log("DB_HOST:", process.env.DB_HOST45);
console.log("DB_USER:", process.env.DB_USER45);
console.log("DB_NAME:", process.env.DB_NAME45);
console.log("DB_PORT:", process.env.DB_PORT45);
// default route

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
