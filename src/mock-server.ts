// mock-upstream.js
import express from "express";
const app = express();
const port = 3001; // Port for the mock upstream server

app.use(express.json());

app.get("/health-check", (req, res) => {
  // Simulate a healthy upstream
  res.status(200).send("OK");
});

app.get("/data", (req, res) => {
  // Simulate a successful response
  res.status(200).json({ message: "Data from upstream" });
});

// Simulate a failure
app.get("/fail", (req, res) => {
  res.status(500).send("Internal Server Error");
});

// Start the mock server
app.listen(port, () => {
  console.log(`Mock upstream server running at http://localhost:${port}`);
});
