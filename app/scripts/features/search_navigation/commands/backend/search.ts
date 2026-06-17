import { CommandExecute } from "../types";
import { handleSearch } from "../../tabs";

export const searchExecute: CommandExecute = (keyword) => handleSearch(keyword);
