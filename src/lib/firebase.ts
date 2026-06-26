import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  projectId: "ceremonial-vortex-471nt",
  appId: "1:553797620662:web:8d7420e5e37e59a3fc2717",
  apiKey: "AIzaSyD5EQOEf95O15ny5wcEYspr3NFlHPFZxBg",
  authDomain: "ceremonial-vortex-471nt.firebaseapp.com",
  storageBucket: "ceremonial-vortex-471nt.firebasestorage.app",
  messagingSenderId: "553797620662",
  measurementId: ""
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "ai-studio-e8abb5e6-6e6a-4972-adee-92acfc228f1c");
