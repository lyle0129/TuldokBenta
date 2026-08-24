import { Router } from "express";
import {
  getShopProfile,
  updateShopProfile,
  uploadShopLogo,
  deleteShopLogo,
} from "../controllers/shopProfileController.js";
import { rawImage } from "../utils/shopLogo.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

// The guard is per route, never on the router — the same split inventory.js
// makes, and for the same reason. GET is what the till reads to print a header,
// so it has to stay reachable by a worker; everything that writes is
// manager-and-up.
const managerUp = requireRole("manager", "super_admin");

router.get("/", getShopProfile);
router.put("/", managerUp, updateShopProfile);

// rawImage sits between the guard and the handler on purpose: an unauthorised
// caller is refused before the server reads half a megabyte off the socket.
router.post("/logo", managerUp, rawImage, uploadShopLogo);
router.delete("/logo", managerUp, deleteShopLogo);

export default router;
