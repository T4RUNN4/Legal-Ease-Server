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
    const lawyersCollection = db.collection("lawyersCollection");
    const hiringCollection = db.collection("hiringCollection");

    app.get("/", (req, res) => {
        res.send("App is running");
    });

    // Random Lawyers
    app.get("/lawyers/random", async (req, res) => {
      const lawyers = await lawyersCollection.aggregate([
        { $sample: {size: 6 } }
      ]).toArray();
      res.send(lawyers);
    })

    //Top Lawyers
    app.get("/lawyers/top", async (req, res) => {
      const lawyers = await lawyersCollection.find({}).sort({ gotHired: -1 }).limit(3).toArray();
      res.send(lawyers)
    })

    app.get("/lawyers/find/:id", async (req, res) => {
      const { id } = req.params;
      const lawyer = await lawyersCollection.findOne({ user: id});
      res.send(lawyer);
    })

    // All Lawyers
    app.get("/lawyers/list", async (req, res) => {
      const lawyers = await lawyersCollection.find().toArray();
      res.json(lawyers);
    });

    //Specific Lawyers
    app.get("/lawyers/list/:id", async (req, res) => {
      const { id } = req.params;
      const lawyer = await lawyersCollection.findOne({ _id: new ObjectId(id) });
      res.json(lawyer);
    });

    // Find lawyer profile that belongs to user
    app.get("/lawyers/:id", async (req, res) => {
      const { id } = req.params;
      const lawyer = await lawyersCollection.findOne({ user: id });
      res.json(lawyer);
    });

    app.get("/user/hiring-history/:id", async(req, res) => {
      const { id } = req.params;
      const hiring = await hiringCollection.find({ userId: id }).toArray();
      res.json(hiring);
    })

    app.get("/lawyer/hiring-history/:id", async(req, res) => {
      const { id } = req.params;
      const hiring = await hiringCollection.find({ lawyerId: id }).toArray();
      res.json(hiring);
    })

    app.post("/hiring", async (req, res) => {
      const hireData = req.body;
      const result = await hiringCollection.insertOne(hireData);

      res.json(result);
    });

    // Updated Lawyers Profile
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
