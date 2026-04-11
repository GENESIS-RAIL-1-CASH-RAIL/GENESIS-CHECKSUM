// GENESIS-CHECKSUM — Health controller
// Handles GET /health. Thin adapter between router and HealthService.

import { Request, Response } from "express";
import { HealthService } from "../services/health.service";

const healthService = new HealthService();

export function handleHealth(_req: Request, res: Response): void {
  res.json(healthService.getHealth());
}
