const express = require('express')
const app = express()
const jwt = require('jsonwebtoken');
const cors = require('cors')
require('dotenv').config()
const stripe = require("stripe")(process.env.PAYMENT_SECRET_KEY)
const port = process.env.PORT || 5000


// middleware
const corsOptions = {
  origin: '*',
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())

// JWT Access
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if(!authorization){
    return res.status(401).send({error: true, message: "unauthorized access"});
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded)=>{
    if(err){
      return res.status(401).send({error: true, message: "unauthorized access"});
    }
    req.decoded = decoded;
    next();
  })
}



const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vhjeumo.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db('game-camp').collection('users');
    const classesCollection = client.db('game-camp').collection('classes');
    const selectClassesCollection = client.db('game-camp').collection('selectClasses');
    const paymentCollection = client.db('game-camp').collection('payments');



     // verify user using JWT
     app.post("/jwt", (req, res)=> {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {expiresIn: "1h"})
      res.send({token})
    });


    //get all users
    app.get("/users", async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    })
    // save user Email and name in DB
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await usersCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: "User already exists" })
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    //   make user admin
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin"
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    //   make user instructor
    app.patch("/users/instructor/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "instructor"
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    
    // get all classes
    app.get("/classes", async(req, res)=> {
      const result = await classesCollection.find().toArray();
      res.send(result)
    });

    // get popular classes
    app.get("/popular-classes", async(req, res)=> {
      const result = await classesCollection.find().sort({enrolled: -1}).limit(6).toArray();
      res.send(result);
    })


    // post class by instructors
    app.post("/classes", async (req, res) => {
      const newClasses = req.body;
      const result = await classesCollection.insertOne(newClasses);
      res.send(result);
    });
    // get instructor classes
    app.get("/instructorClasses", async (req, res) => {
        let query = {};
        if (req.query?.email) {
          query = { email: req.query.email }
        }
        const result = await classesCollection.find(query).toArray();
        res.send(result);
    });
    // send feedback for denied class
    app.patch("/classes/denied/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id)
      const updateFeedback = req.body;
      console.log(updateFeedback)
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          feedback: updateFeedback.feedback
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // update class status for approve
    app.patch("/classes/approve/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "approved"
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
    // update class status for deny
    app.patch("/classes/deny/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          status: "denied"
        },
      };
      const result = await classesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // post select classes by student
    app.post("/select-classes", async(req, res)=> {
      const selectClass = req.body;
      const result = await selectClassesCollection.insertOne(selectClass);
      res.send(result);
    });

    // get select classes by student
    app.get("/select-classes", async(req, res)=> {
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email }
      }
      const result = await selectClassesCollection.find(query).toArray();
      res.send(result);
    });

    // delete select single class by student
    app.delete("/select-classes/:id", async(req, res)=> {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await selectClassesCollection.deleteOne(query);
      res.send(result)
    });

    // payment related apis
    app.post("/create-payment-intent", verifyJWT, async(req, res)=> {
      const {price} = req.body;
      const amount = price*100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"]
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    });

    // post payments
    app.post("/payments", async(req, res)=> {
      const payment = req.body;
      const result = await paymentCollection.insertOne(payment);
      res.send(result);
    });

    app.get("/payments", async(req, res)=> {
      let query = {};
      if (req.query?.email) {
        query = { email: req.query.email }
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    })



    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Assignment 12 Server is running..')
})

app.listen(port, () => {
  console.log(`Assignment 12 running on port ${port}`)
})