// save as firebase.js (put in same folder as index.html & chat.html) -->

// firebase.js - simple module (ES module)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDEPxzueUia3bqkXIrWB_4xF_qOh5ZvAjI",
  authDomain: "chatapp-9a742.firebaseapp.com",
  databaseURL: "https://chatapp-9a742-default-rtdb.firebaseio.com",
  projectId: "chatapp-9a742",
  storageBucket: "chatapp-9a742.appspot.com",
  messagingSenderId: "384469214707",
  appId: "1:384469214707:web:ac32854938b240e14c5e86"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const rdb = getDatabase(app);
