import { Router } from 'express';
import * as folderController from '../controllers/folderController';

const router = Router();

router.get('/', folderController.getFolderTree);
router.post('/', folderController.createFolder);
router.delete('/:path(*)', folderController.deleteFolder);
router.put('/rename', folderController.renameFolder);

export default router;
