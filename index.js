require('dotenv').config();
const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');

// Move this line to the top, before initializing the stripe object
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8vksczm.mongodb.net/TourX?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // Access the collections
    const reviewCollection = client.db("TourX").collection("reviews");
    const packageCollection = client.db("TourX").collection("packages");
    const BookingCollection = client.db("TourX").collection("bookings");
    const userCollection = client.db("TourX").collection("users");
    const PaymnetCollection = client.db("TourX").collection("payments");
    const guideCollection = client.db("TourX").collection("guides");
    const hiredguideCollection = client.db("TourX").collection("hiredguides");

    // jwt apis

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h'
      });
      res.send({ token })
    });

    // middlewares 

    const verifyToken = (req, res, next) => {
      console.log("Inside verifyToken , Authorization Header ", req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Forbidden Access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };


    // Verify Admin Middleware 

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'Unauthorized access' })
      }
      next();
    };

    // verify Guide Middleware 
    const verifyGuide = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isGuide = user?.role === 'guide';
      if (!isGuide) {
        return res.status(403).send({ message: 'Unauthorized access' })
      }
      next();
    };

    // user apis 

    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existinguser = await userCollection.findOne(query);
      if (existinguser) {
        return res.send({ message: 'user already exists ', insertedId: null });

      }
      const result = await userCollection.insertOne(user);
      res.send(result)

    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    })

    // admin 

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const admin = user?.role === 'admin';
      res.send({ admin })
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = { $set: { role: 'admin' } };
      const result = await userCollection.updateOne(filter, updatedDoc);
      console.log("Admin role assigned:", result);
      res.send(result);
    });


    // guide 

    app.get('/users/guide/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Forbidden access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const guide = user?.role === 'guide';
      res.send({ guide })
    })

    app.patch('/users/guide/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filtter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          role: 'guide'
        }
      };
      const result = await userCollection.updateOne(filtter, updatedDoc);
      res.send(result);
    })

    // guides pis

    app.get('/guides', async (req, res) => {
      const result = await guideCollection.find().toArray();
      res.send(result);
    });

    app.post('/guides', verifyToken, verifyAdmin, async (req, res) => {
      const guide = req.body;
      const result = await guideCollection.insertOne(guide);
      res.send(result);
  });

    app.get('/guides/:id', async (req, res) => {
      const { id } = req.params;
      console.log('Received ID:', id); // Log the received ID

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: 'Invalid guide ID' }); // Return error if ID is not valid
      }

      try {
        const guide = await guideCollection.findOne({ _id: new ObjectId(id) });
        if (!guide) {
          return res.status(404).json({ message: 'Guide not found' });
        }
        res.json(guide);
      } catch (error) {
        console.error('Error fetching guide:', error);
        res.status(500).json({ message: 'Server error' });
      }
    });




    // New POST route for hiring a guide
    app.post('/guide', async (req, res) => {
      const { guideId, date, name, email, bookedBy } = req.body;
      if (!guideId || !date || !name || !email || !bookedBy) {
        return res.status(400).send({ message: 'All fields are required' });
      }
      try {
        const bookingData = { guideId, date, name, email, bookedBy };
        const result = await hiredguideCollection.insertOne(bookingData);
        res.status(201).send({ message: 'Guide hired successfully', data: result.insertedId });
      } catch (error) {
        console.error('Error hiring guide:', error);
        res.status(500).send({ message: 'Failed to hire guide' });
      }
    });


    // Get assigned tours for a specific guide
    app.get('/guide/:email', verifyToken, verifyGuide, async (req, res) => {
      const email = req.params.email;
      try {
        const query = { email: email };
        const assignedTours = await hiredguideCollection.find(query).toArray();
        if (!assignedTours.length) {
          return res.status(404).send({ message: 'No tours assigned to this guide.' });
        }
        res.send(assignedTours);
      } catch (error) {
        console.error('Error fetching assigned tours:', error);
        res.status(500).send({ message: 'Failed to fetch assigned tours.' });
      }
    });










    //  reviews
    app.get('/reviews', async (req, res) => {
      try {
        const result = await reviewCollection.find().toArray();
        res.send(result);
      } catch (error) {
        console.error("Error fetching reviews: ", error);
        res.status(500).send("Error fetching reviews");
      }
    });

    app.post("/reviews", async (req, res) => {
      const Review = req.body;
      try {
        const result = await reviewCollection.insertOne(Review);
        res.send(result);

      }
      catch (error) {
        console.error("Error adding review", error);
        res.status(500).send({ message: "failed to add reviews" })
      }
    })

    // packages apis
    app.get('/package', async (req, res) => {
      try {
        const packages = await packageCollection.find().toArray();
        console.log('Packages from DB:', packages);  // Add this log
        res.send(packages);
      } catch (error) {
        console.error('Error fetching packages:', error);
        res.status(500).send('Error fetching packages');
      }
    });

    app.get('/package/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await packageCollection.findOne(query);
      res.send(result)
    })

    app.post('/package', verifyToken, verifyAdmin, async (req, res) => {
      const packageitem = req.body;
      try {
        const result = await packageCollection.insertOne(packageitem);
        res.send(result);
      } catch (error) {
        console.error("Error inserting package:", error);
        res.status(500).send({ message: 'Failed to insert package' });
      }
    });


    app.patch('/package/:id', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filtter = { _id: new ObjectId(id) };

      const updatedDoc = {
        $set: {
          name: item.name,
          tourType: item.tourType,
          price: item.price,
          description: item.description,
          image: item.image,
        }

      };

      const result = await packageCollection.updateOne(filtter, updatedDoc);
      res.send(result);
    })

    app.delete('/package/:id', verifyToken, verifyAdmin, async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          console.error("Invalid ID Format ", id);
          return res.status(400).send({ message: "Invalid Id format" });
        }
        const query = { _id: new ObjectId(id) };
        const result = await packageCollection.deleteOne(query);

        if (result.deletedCount === 0) {
          console.error("No document found with ID", id);
          return res.status(400).send({ message: "No document found with the provided ID" });


        }

        res.send(result)

      }
      catch (error) {
        console.error("Failed to delete Item ", error);
        res.status(500).send({ message: "No document found with the provided id" })

      }
    })





    // Booking apis

    app.get("/bookings", async (req, res) => {
      const email = req.query.email;
      console.log("Requested email : ", email);
      const query = { email: email };
      const bookingItem = await BookingCollection.find(query).toArray();
      console.log("Fetched Booing Items", bookingItem);
      res.send(bookingItem);


    });

    app.post("/bookings", async (req, res) => {
      const bookingItem = req.body;
      console.log("Received booking item:", bookingItem); // Log the received booking item

      if (!bookingItem.email) {
        return res.status(400).send({ message: "Email is required" });
      }

      try {
        const result = await BookingCollection.insertOne(bookingItem);
        console.log("Inserted result:", result); // Log the insert result
        res.send(result);
      } catch (error) {
        console.error("Error inserting booking item:", error); // Log any errors
        res.status(500).send({ message: "Internal server error" });
      }
    });

    app.delete('/bookings/:id', async (req, res) => {
      try {
        const id = req.params.id;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ message: "invalid ID format" });

        }

        const query = { _id: new ObjectId(id) };
        const result = await BookingCollection.deleteOne(query)

        if (result.deletedCount === 1) {
          res.send({ deletedCount: result.deletedCount });

        }
        else {
          res.status(404).send({ deletedCount: 0 })
        }
      }
      catch (error) {
        console.error("Failed tp delete item ", error);
        res.status(500).send({ message: "Failed to delete Item " })
      }
    });

    // payments intent 

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req.params.email };
      if (req.params.email !== req.decoded.email) {
        return res.status(403).send({ message: "Forbidden Access" });

      }

      const result = await PaymnetCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/create-payment-intent', verifyToken, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100); // Stripe takes amounts in cents
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ['card']
        });
        res.send({
          clientSecret: paymentIntent.client_secret
        });
      } catch (error) {
        console.log("Error creating intent ", error);
        res.status(500).send({ message: "Failed to create Payment intent " });
      }
    });

    app.post("/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      try {
        // Insert the payment data
        const paymentResult = await PaymnetCollection.insertOne(payment);

        // Update the status in the payment object to 'completed'
        await PaymnetCollection.updateOne(
          { _id: paymentResult.insertedId },
          { $set: { status: "Paid" } }
        );

        // Remove bookings after payment is successful
        const query = { _id: { $in: payment.bookingItemIDs.map(id => new ObjectId(id)) } };
        const deleteResult = await BookingCollection.deleteMany(query);

        res.send({ paymentResult, deleteResult });
      } catch (error) {
        console.error("Failed to process payment ", error);
        res.status(500).send({ message: "Failed to process payment " });
      }
    });

    // userstats 

    app.get('/user-stats/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      const totalBookings = await BookingCollection.countDocuments({ email });
      const paymentsResult = await PaymnetCollection.aggregate([
        { $match: { email: email } },
        { $group: { _id: null, totalSpent: { $sum: '$price' } } }
      ]).toArray();

      const totalSpent = paymentsResult.length > 0 ? paymentsResult[0].totalSpent : 0;

      res.send({
        email,
        totalBookings,
        totalSpent
      });
    });

    // guideStats 

    app.get('/guide-stats/:email', verifyToken, verifyGuide, async (req, res) => {
      const email = req.params.email;

      // Fetch total number of assigned tours
      const totalAssignedTours = await hiredguideCollection.countDocuments({ email });

      // Fetch total reviews and average rating for the guide
      const reviews = await reviewCollection.aggregate([
        { $match: { guideEmail: email } },
        { $group: { _id: null, totalReviews: { $sum: 1 }, avgRating: { $avg: '$rating' } } }
      ]).toArray();

      const totalReviews = reviews.length > 0 ? reviews[0].totalReviews : 0;
      const avgRating = reviews.length > 0 ? reviews[0].avgRating : 0;

      res.send({
        email,
        totalAssignedTours,
        totalReviews,
        avgRating
      });
    });
    // admin 

    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const totalUsers = await userCollection.estimatedDocumentCount();
      const totalGuides = await guideCollection.estimatedDocumentCount();
      const totalPackages = await packageCollection.estimatedDocumentCount();
      const totalBookings = await BookingCollection.estimatedDocumentCount();

      const revenueResult = await PaymnetCollection.aggregate([
        { $group: { _id: null, totalRevenue: { $sum: '$price' } } }
      ]).toArray();

      const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

      res.send({
        totalUsers,
        totalGuides,
        totalPackages,
        totalBookings,
        totalRevenue
      });
    });








    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Close the client connection
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Tour X server is running');
});

app.listen(port, () => {
  console.log(`Tour X Server is running on port ${port}`);
});
