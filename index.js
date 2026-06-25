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
    origin: process.env.CLIENT_URL || "*",
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
    const userCollection = db.collection("user");
    const commentsCollection = db.collection("comments");

    app.get("/", (req, res) => {
      res.send("App is running");
    });

    app.get("/admin/users", async (req, res) => {
      const users = await userCollection.find().toArray();
      res.json(users);
    });

    app.get("/comments/lawyer/:id", async (req, res) => {
      const { id } = req.params;
      const comments = await commentsCollection
        .find({ lawyerId: id })
        .toArray();

      res.json(comments);
    });

    app.get("/comments/user/:id", async (req, res) => {
      const { id } = req.params;
      const comments = await commentsCollection.find({ userId: id }).toArray();

      res.json(comments);
    });

    app.get("/user/:id", async (req, res) => {
      const { id } = req.params;
      const user = await userCollection.findOne({ _id: new ObjectId(id) });

      res.json(user);
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

    // All Lawyers
    app.get("/lawyers/list", async (req, res) => {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 12;
      const skip = (page - 1) * limit;

      const { search, specialization, maxFee } = req.query;
      const query = {
        publishingFee: "paid",
      };

      if (search) {
        query.name = { $regex: search, $options: "i" };
      }

      if (specialization) {
        query.specialization = specialization;
      }

      const lawyers = await lawyersCollection
        .find(query)
        .skip(skip)
        .limit(limit)
        .toArray();

      const total = await lawyersCollection.countDocuments(query);

      res.json({
        lawyers,
        total,
        page,
        totalPage: Math.ceil(total / limit),
      });
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
      const lawyerProfile = await lawyersCollection
        .find({ user: id })
        .toArray();

      res.json(lawyerProfile);
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

    app.get("/transactions", async (req, res) => {
      const transactions = await hiringCollection
        .find({ status: "paid" })
        .toArray();
      res.json(transactions);
    });

    app.get("/admin/stats", async (req, res) => {
      const totalUser = await userCollection.countDocuments();
      const totalLawyer = await lawyersCollection.countDocuments({
        publishingFee: "paid",
      });
      const totalHires = await hiringCollection.countDocuments({
        status: "paid",
      });

      const revenueResult = await lawyersCollection.countDocuments({ publishingFee: "paid" });
      const totalRevenue = revenueResult * 500;

      res.send({ totalHires, totalLawyer, totalRevenue, totalUser });
    });

    app.get("/checkout/:id", async (req, res) => {
      const { id } = req.params;

      const hiringData = await hiringCollection.findOne({
        _id: new ObjectId(id),
      });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Hiring ${hiringData.lawyerName}`,
              },
              unit_amount: Math.round(Number(hiringData.fee) * 100),
            },
            quantity: 1,
          },
        ],
        metadata: {
          hiringId: id,
        },
        success_url: `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&hiringId=${id}`,
        cancel_url: `${process.env.CLIENT_URL}/checkout/cancel`,
      });

      return res.json({ url: session.url });
    });

    app.get("/verify-payment", async (req, res) => {
      const { session_id, hiringId } = req.query;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      const updateResult = await hiringCollection.findOneAndUpdate(
        { _id: new ObjectId(hiringId) },
        {
          $set: {
            status: "paid",
            stripeSessionId: session_id,
            transactionId: session.payment_intent,
            paidAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );

      const lawyerId = updateResult.lawyerProfileId;
      const userId = updateResult.userId;

      const updateClient = await lawyersCollection.updateOne(
        { _id: new ObjectId(lawyerId) },
        {
          $addToSet: { client: userId },
        },
      );

      return res.json({
        success: true,
        paymentDetails: {
          transactionId: session.payment_intent,
          amountPaid: session.amount_total / 100,
        },
        updateClient,
      });
    });

    app.get("/checkout/lawyer/:id", async (req, res) => {
      const { id } = req.params;

      const lawyer = await lawyersCollection.findOne({
        _id: new ObjectId(id),
      });

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Lawyer Listing Fee - ${lawyer.name}`,
              },
              unit_amount: 500 * 100,
            },
            quantity: 1,
          },
        ],
        metadata: {
          lawyerId: id,
          paymentType: "lawyer",
        },
        success_url: `${process.env.CLIENT_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}&lawyerId=${id}`,
        cancel_url: `${process.env.CLIENT_URL}/checkout/cancel`,
      });

      return res.json({ url: session.url });
    });

    app.get("/verify-lawyer", async (req, res) => {
      const { session_id, lawyerId } = req.query;
      const session = await stripe.checkout.sessions.retrieve(session_id);

      const updateResult = await lawyersCollection.findOneAndUpdate(
        { _id: new ObjectId(lawyerId) },
        {
          $set: {
            publishingFee: "paid",
            publishingFeestripeSessionId: session_id,
            publishingFeetransactionId: session.payment_intent,
            publishingFeepaidAt: new Date(),
          },
        },
        { returnDocument: "after" },
      );

      return res.json({
        success: true,
        paymentDetails: {
          transactionId: session.payment_intent,
          amountPaid: session.amount_total / 100,
        },
      });
    });

    app.post("/hiring", async (req, res) => {
      const hireData = req.body;
      const result = await hiringCollection.insertOne(hireData);

      res.json(result);
    });

    app.post("/lawyer/add-new", async (req, res) => {
      const lawyerData = req.body;
      const result = await lawyersCollection.insertOne(lawyerData);

      res.json(result);
    });

    app.post("/commments", async (req, res) => {
      const comment = req.body;
      const result = await commentsCollection.insertOne(comment);

      res.json(result);
    });

    app.post("/users/update-role/:id", async (req, res) => {
      const { id } = req.params;
      const { userRole } = req.body;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            role: userRole,
          },
        },
      );

      return res.json();
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

    app.put("/users/update-profile", async (req, res) => {
      const { id, name, email, image } = req.body;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            name,
            email,
            image,
          },
        },
      );

      res.json(result);
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

    app.patch("/lawyer/legal-profile/:id", async (req, res) => {
      const { id } = req.params;
      const { specialization, fee, summary } = req.body;

      const result = await lawyersCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            fee: fee,
            specialization: specialization,
            summary: summary
          }
        }
      );

      res.json(result);
    })

    app.patch("/comments/update/:id", async (req, res) => {
      const { id } = req.params;
      const { comment } = req.body;

      const result = await commentsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            comment: comment,
          },
        },
      );

      res.json(result);
    });

    app.patch("/admin/user/update/:id", async (req, res) => {
      const { id } = req.params;
      const { role } = req.body;

      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { role } },
      );

      res.json(result);
    });

    app.delete("/comments/delete/:id", async (req, res) => {
      const { id } = req.params;
      const result = await commentsCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.delete("/admin/users/delete/:id", async (req, res) => {
      const { id } = req.params;
      const result = await userCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result);
    });

    app.delete("/lawyer/profile/:id", async (req, res) => {
      const { id } = req.params;
      const result = await lawyersCollection.deleteOne({
        _id: new ObjectId(id),
      });

      res.json(result)
    })

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } finally {
  }
}

run().catch(console.dir);
