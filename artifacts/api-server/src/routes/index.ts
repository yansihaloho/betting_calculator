import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userDataRouter from "./userData";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/user", userDataRouter);

export default router;
