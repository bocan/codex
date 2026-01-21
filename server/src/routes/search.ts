import { Router } from 'express';
import { searchPages } from '../controllers/searchController';

const router = Router();

router.get('/', searchPages);

export default router;
