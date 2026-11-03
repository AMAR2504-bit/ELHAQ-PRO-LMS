import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, updateProfile, sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

export {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, where, serverTimestamp, writeBatch,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
