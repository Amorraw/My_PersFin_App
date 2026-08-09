// Category routes: serve the category catalog as a nested tree or flat subcategory list

import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/requireLogin";
import { CATEGORY_CATALOG } from "../data/categoryCatalog";

const router = Router();

router.use(requireAuth);

// GET /tree — return major categories with their subcategories as a nested structure
router.get("/tree", (_req: Request, res: Response) => {
  return res.json({
    majorCategories: CATEGORY_CATALOG
  });
});

// GET /flat — return all subcategories as a flat list with their parent major category key and name
router.get("/flat", (_req: Request, res: Response) => {
  const subcategories = CATEGORY_CATALOG.flatMap((major) =>
    major.subcategories.map((sub) => ({
      ...sub,
      majorKey: major.key,
      majorName: major.name
    }))
  );

  return res.json({ subcategories });
});

export default router;
