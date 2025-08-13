import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

//Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAUVeXAXfm6ZmOzP6Myu7f_6S0KZMHlZqg",
  authDomain: "tailor-management-app-5d52f.firebaseapp.com",
  projectId: "tailor-management-app-5d52f",
  storageBucket: "tailor-management-app-5d52f.firebasestorage.app",
  messagingSenderId: "418512735565",
  appId: "1:418512735565:web:379d550f7b06f0a2aa7b04"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);






