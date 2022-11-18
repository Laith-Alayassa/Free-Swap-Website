const express = require("express");
const { Db } = require("mongodb");
const app = express();
const port = 3000;
const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const path = require("path");
const bodyParser = require("body-parser");
const fs = require("fs");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
let multer = require("multer");
const { deserializeUser } = require("passport");
const { type } = require("os");

app.use(express.static(__dirname + "/public"));
app.set("views", __dirname + "/public/views");
app.set("view engine", "ejs");
app.use("/uploads", express.static("uploads"));

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);

app.use(bodyParser.raw());
app.use(bodyParser.text());
app.use(bodyParser.json());
app.use(
  session({
    secret: "change this",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(passport.initialize());
app.use(passport.session());

mongoose.connect(
  "mongodb+srv://freeswapadmin:cafemacisgreat@freeswap.nx7crsb.mongodb.net/?retryWrites=true&w=majority",
  {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  }
);

// Chooses which DB tp save to
const DB = mongoose.connection.useDb("freeswap");

// Models

const itemSchema = mongoose.Schema({
  name: String,
  description: String,
});

const Item = DB.model("item", itemSchema, "items");

let imageSchema = new mongoose.Schema({
  name: String,
  desc: String,
  type: String,
  img: {
    data: Buffer,
    contentType: String,
  },
  date: { type: Date, default: Date.now },
});

let imgModel = DB.model("Image", imageSchema);

const userSchema = mongoose.Schema({
  username: String,
  password: String,
});

userSchema.plugin(passportLocalMongoose);

let User = DB.model("User", userSchema);

passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

// Multer setup

let storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads");
  },
  filename: (req, file, cb) => {
    cb(null, file.fieldname + "-" + Date.now());
  },
});

let upload = multer({ storage: storage });

// Routing 🐍
app
  .route("/")
  .get((req, res) => {
    imgModel.find({}, (err, items) => {
      if (err) {
        console.log(err);
        res.status(500).send("An error occurred", err);
      } else {
        // Only the first 12 items are passed into the homepage (first sorted by date added)
        items.sort((item) => item.date).reverse();
        if (items.length > 12) items = items.slice(0, 12);
        res.render("home", { items });
      }
    });
  })
  .post((req, res) => {
    res.render("home");
  });

app.route("/about").get((req, res) => {
  res.render("about");
});

app
  .route("/login")
  .get((req, res) => {
    res.render("login");
  })
  .post((req, res) => {
    const user = new User({
      username: req.body.username,
      password: req.body.password,
    });
    req.login(user, (err) => {
      if (err) {
        console.log(err);
        res.redirect("/login");
      } else {
        passport.authenticate("local", {
          failureRedirect: "/login",
          failureMessage: true,
        })(req, res, () => {
          res.redirect("/admin");
        });
      }
    });
  });

app.route("/logout").get((req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err);
    }
    res.redirect("/");
  });
});

app.route("/admin").get((req, res) => {
  if (req.isAuthenticated()) {
    imgModel.find({}, (err, items) => {
      if (err) {
        console.log(err);
        res.status(500).send("An error occurred", err);
      } else {
        res.render("admin", { items });
      }
    });
  } else {
    res.redirect("/login");
  }
});

app.route("/all-items").get(async (req, res) => {
  imgModel.find({}, (err, items) => {
    if (err) {
      console.log(err);
      res.status(500).send("An error occurred", err);
    } else {
      res.render("all-items", { items });
    }
  });
});

app.route("/single-item/:id").get((req, res) => {
  const id = req.params.id;
  imgModel.find({ _id: id }, (err, item) => {
    if (err) {
      console.log(err);
      res.status(500).send("An error occurred", err);
    } else {
      res.render("individual-item", { item });
    }
  });
});

app.route("/admin-newitem").get((req, res) => {
  if (req.isAuthenticated()) {
    res.render("admin-newitem");
  } else {
    res.redirect("/login");
  }
});

app.post("/upload-image", upload.single("image"), (req, res, next) => {
  let obj = {
    name: capitalizeFirstLetter(req.body.name),
    desc: capitalizeFirstLetter(req.body.desc),
    type: req.body.type,
    img: {
      data: fs.readFileSync(
        path.join(__dirname + "/uploads/" + req.file.filename)
      ),
      contentType: "image/png",
    },
  };

  imgModel.create(obj, (err, item) => {
    if (err) {
      res.render("admin-newitem", { err });
    } else {
      fs.unlinkSync(path.join(__dirname + "/uploads/" + req.file.filename)); // Removes image from local drive
      res.render("admin-newitem", { obj });
    }
  });
});

app.route("/delete/:id").get((req, res) => {
  const id = req.params.id;
  imgModel.find({ _id: id }).remove().exec();
  res.redirect("/admin");
});

app
  .route("/edit/:id")
  .get((req, res) => {
    const id = req.params.id;
    imgModel.find({ _id: id }, (err, item) => {
      if (err) {
        console.log(err);
      } else {
        res.render("admin-edit", { item });
      }
    });
  })
  .post((req, res) => {
    const id = req.params.id;
    imgModel.find({ _id: id }, (err, foundImage) => {
      if (err) {
        console.log("error in post edit form");
      } else {
        let update = {
          name: capitalizeFirstLetter(req.body.name),
          desc: capitalizeFirstLetter(req.body.desc),
          type: req.body.type,
        };
        imgModel.findByIdAndUpdate(
          { _id: id },
          update,
          { multi: true, new: true },
          (err) => {
            if (err) {
              console.log(err);
            } else {
              console.log("updated item");
            }
          }
        );
        res.redirect("/admin");
      }
    });
  });

app.listen(process.env.PORT || 3000, function () {
  console.log(
    "Express server listening on port %d in %s mode",
    this.address().port,
    app.settings.env
  );
});

function capitalizeFirstLetter(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
// app.listen(port, () => {
//   console.log(`listening on port ${port}`);
// });

// code for creating new user

/* 

User.register({ username: req.body.username }, req.body.password , (err, user) => {
      if (err) {
        console.log(err);
        res.redirect("/login");
      } else {
        console.log("new user made" + user);
        res.redirect("/login");
      }
    });
*/
