import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Inventory from "./pages/Inventory";
import Services from "./pages/Services";
import OpenSales from "./pages/OpenSales";
import ClosedSales from "./pages/ClosedSales";
import Reporting from "./pages/Reporting";

function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/open-sales" />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/services" element={<Services />} />
        <Route path="/open-sales" element={<OpenSales />} />
        <Route path="/closed-sales" element={<ClosedSales />} />
        <Route path="/reporting" element={<Reporting />} />
      </Routes>
    </Router>
  );
}

export default App;
