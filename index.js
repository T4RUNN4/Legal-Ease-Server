const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

const PORT = process.env.PORT;
const URI = process.env.MONGO_URI;

const client = new MongoClient(URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db = client.db("legal-ease");
    const lawyersCollection = db.collection("lawyersCollection")

    app.get("/", (req, res) => {
        res.send("App is running");
    });

    app.get("/lawyers/:id", async (req, res) => {
      const { id } = req.params;
      const lawyer = await lawyersCollection.findOne({ user: id });
      res.json(lawyer);
    });


    app.put("/lawyers/update-profile", async (req, res) => {
      const lawyerData = req.body;

      await lawyersCollection.updateOne(
        { user: lawyerData.user }, 
        { $set: lawyerData }, 
        { upsert: true }
      );

      res.send({ success: true });
    })

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } finally {}
}

run().catch(console.dir);
