const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const Stripe = require("stripe");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
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
      const lawyers = await lawyersCollection
        .aggregate([{ $sample: { size: 6 } }])
        .toArray();
      res.send(lawyers);
    });

    //Top Lawyers
    app.get("/lawyers/top", async (req, res) => {
      const lawyers = await lawyersCollection
        .find({})
        .sort({ gotHired: -1 })
        .limit(3)
        .toArray();
      res.send(lawyers);
    });

    app.get("/lawyers/find/:id", async (req, res) => {
      const { id } = req.params;
      const lawyer = await lawyersCollection.findOne({ user: id });
      res.send(lawyer);
    });

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

    app.get("/user/hiring-history/:id", async (req, res) => {
      const { id } = req.params;
      const hiring = await hiringCollection.find({ userId: id }).toArray();
      res.json(hiring);
    });

    app.get("/lawyer/hiring-history/:id", async (req, res) => {
      const { id } = req.params;
      const hiring = await hiringCollection.find({ lawyerId: id }).toArray();
      res.json(hiring);
    });

    app.get("/checkout/:id", async (req, res) => {
      const { id } = req.params;

      const hiringData = await hiringCollection.findOne({
        _id: new ObjectId(id),
      });

      if (!hiringData) {
        return res.status(404).json({ error: "Not found" });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Hiring ${hiringData.lawyerName}`,
              },
              unit_amount: hiringData.fee * 100,
            },
            quantity: 1,
          },
        ],

        success_url: `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&hiringId=${id}`,
        cancel_url: `${process.env.CLIENT_URL}/checkout/cancel`,
      });

      return res.json({ url: session.url });
    });

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
        { upsert: true },
      );

      res.send({ success: true });
    });

    app.patch("/hiring/update-status/:id", async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      const result = await hiringCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status } },
      );

      res.send(result);
    });

    app.patch("/mark-paid/:id", async (req, res) => {
      const { id } = req.params;

      await hiringCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "paid",
            transaction: {
              transactionId: "TEST-" + Date.now(),
              amount: "from-hiring-record",
              transactionDate: new Date(),
            },
          },
        },
      );

      res.json({ success: true });
    });

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } finally {
  }
}

run().catch(console.dir);
