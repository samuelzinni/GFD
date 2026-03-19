import { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import api from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Get user profile from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({
            id: firebaseUser.uid,
            email: firebaseUser.email,
            ...userDoc.data()
          });
        } else {
          // First user setup - try to register as admin
          try {
            await api.post('/setup/admin', { displayName: firebaseUser.email });
            const refreshed = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (refreshed.exists()) {
              setUser({ id: firebaseUser.uid, email: firebaseUser.email, ...refreshed.data() });
            }
          } catch {
            setUser(null);
          }
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const login = async (email, password) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Trigger setup/admin in case first login
    try {
      await api.post('/setup/admin', { displayName: email });
    } catch {}
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
    const userData = userDoc.exists() ? { id: cred.user.uid, email: cred.user.email, ...userDoc.data() } : null;
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
