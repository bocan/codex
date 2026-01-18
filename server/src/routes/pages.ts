import { Router } from 'express';
import * as pageController from '../controllers/pageController';

const router = Router();

// Specific routes must come before wildcard routes
router.get('/', pageController.getPages);
router.post('/', pageController.createPage);
router.put('/move', pageController.movePage);
router.put('/rename/file', pageController.renamePage);

// Wildcard routes come last
router.get('/:path(*)', pageController.getPage);
router.put('/:path(*)', pageController.updatePage);
router.delete('/:path(*)', pageController.deletePage);

export default router;
