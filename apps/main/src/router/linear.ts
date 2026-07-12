import { LinearService } from '../services/linear';
import { publicProcedure, router } from '../trpc';

const linear = new LinearService();

// Stub router — see LinearService / milestone 5.
export const linearRouter = router({
  myIssues: publicProcedure.query(() => linear.myIssues()),
});
