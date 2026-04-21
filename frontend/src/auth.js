// ─── Auth & User Profile System ──────────────────────────────────────────────
const AUTH_KEY   = "retailens_auth";
const USERS_KEY  = "retailens_users";

export const ROLES = {
  owner:   { label: "Owner",           color: "#f72585", canExport: true,  canManageUsers: true,  canViewAll: true  },
  manager: { label: "Store Manager",   color: "#f4a261", canExport: true,  canManageUsers: false, canViewAll: true  },
  staff:   { label: "Staff",           color: "#4cc9f0", canExport: false, canManageUsers: false, canViewAll: false },
};

const DEFAULT_USERS = [
  { id: 1, name: "Aryan Shah",    email: "owner@retailens.com",   password: "owner123",   role: "owner",   store: "All Stores",        avatar: "AS", lastLogin: null },
  { id: 2, name: "Priya Mehta",   email: "manager@retailens.com", password: "manager123", role: "manager", store: "Downtown Flagship",  avatar: "PM", lastLogin: null },
  { id: 3, name: "Rohit Sharma",  email: "staff@retailens.com",   password: "staff123",   role: "staff",   store: "Mall Branch",        avatar: "RS", lastLogin: null },
];

export function getUsers() {
  try {
    const saved = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    if (!saved) { localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS)); return DEFAULT_USERS; }
    return saved;
  } catch { return DEFAULT_USERS; }
}

export function saveUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getCurrentUser() {
  try { return JSON.parse(localStorage.getItem(AUTH_KEY) || "null"); } catch { return null; }
}

export function login(email, password) {
  const users = getUsers();
  const user  = users.find(u => u.email === email && u.password === password);
  if (!user) return { success: false, error: "Invalid email or password" };
  const updated = { ...user, lastLogin: new Date().toLocaleString("en-IN") };
  saveUsers(users.map(u => u.id === user.id ? updated : u));
  localStorage.setItem(AUTH_KEY, JSON.stringify(updated));
  return { success: true, user: updated };
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}

export function addUser(newUser) {
  const users = getUsers();
  const user  = { ...newUser, id: Date.now(), avatar: newUser.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2), lastLogin: null };
  saveUsers([...users, user]);
  return user;
}

export function deleteUser(id) {
  saveUsers(getUsers().filter(u => u.id !== id));
}
