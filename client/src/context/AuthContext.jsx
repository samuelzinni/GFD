import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc, setDoc, getDocs, collection, limit, query, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext(null);

// Internally map username to email for Firebase Auth
function usernameToEmail(username) {
  return `${username.toLowerCase().trim()}@gfd.local`;
}

function emailToUsername(email) {
  return email.replace('@gfd.local', '');
}

// Ensure user document exists in Firestore (replaces Cloud Function)
async function ensureUserDoc(firebaseUser) {
  const userRef = doc(db, 'users', firebaseUser.uid);
  const userDoc = await getDoc(userRef);

  if (userDoc.exists()) {
    return { id: firebaseUser.uid, ...userDoc.data() };
  }

  // If no users exist yet, make this one admin
  const usersSnapshot = await getDocs(query(collection(db, 'users'), limit(1)));
  const role = usersSnapshot.empty ? 'admin' : 'scanner';
  const username = emailToUsername(firebaseUser.email);

  await setDoc(userRef, {
    username,
    displayName: username,
    role,
    createdAt: serverTimestamp()
  });

  return { id: firebaseUser.uid, username, displayName: username, role };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userData = await ensureUserDoc(firebaseUser);
          setUser(userData);
        } catch {
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (username, password) => {
    const email = usernameToEmail(username);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const userData = await ensureUserDoc(cred.user);
    setUser(userData);
    return userData;
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
