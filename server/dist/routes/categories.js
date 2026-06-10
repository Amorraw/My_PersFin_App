"use strict";
// Category routes: serve the category catalog as a nested tree or flat subcategory list
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const requireLogin_1 = require("../middleware/requireLogin");
const categoryCatalog_1 = require("../data/categoryCatalog");
const router = (0, express_1.Router)();
router.use(requireLogin_1.requireAuth);
// GET /tree — return major categories with their subcategories as a nested structure
router.get("/tree", (_req, res) => {
    return res.json({
        majorCategories: categoryCatalog_1.CATEGORY_CATALOG
    });
});
// GET /flat — return all subcategories as a flat list with their parent major category key and name
router.get("/flat", (_req, res) => {
    const subcategories = categoryCatalog_1.CATEGORY_CATALOG.flatMap((major) => major.subcategories.map((sub) => ({
        ...sub,
        majorKey: major.key,
        majorName: major.name
    })));
    return res.json({ subcategories });
});
exports.default = router;
