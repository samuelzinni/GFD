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

// Internally map username to email for Firebase Auth
function usernameToEmail(username) {
  return `${username.toLowerCase().trim()}@gfd.local`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUser({ id: firebaseUser.uid, ...userDoc.data() });
        } else {
          // First user setup
          try {
            await api.post('/setup/admin', {});
            const refreshed = await getDoc(doc(db, 'users', firebaseUser.uid));
            if (refreshed.exists()) {
              setUser({ id: firebaseUser.uid, ...refreshed.data() });
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

  const login = async (username, password) => {
    const email = usernameToEmail(username);
    const cred = await signInWithEmailAndPassword(auth, email, password);
    // Ensure user doc exists
    try { await api.post('/setup/admin', {}); } catch {}
    const userDoc = await getDoc(doc(db, 'users', cred.user.uid));
    const userData = userDoc.exists() ? { id: cred.user.uid, ...userDoc.data() } : null;
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
