import { Router, type IRouter } from "express";
import healthRouter from "./health";
import userDataRouter from "./userData";
import resultsRouter from "./results";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/user", userDataRouter);
router.use(resultsRouter);

export default router;
