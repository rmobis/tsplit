import { botCache } from '../../deps.ts';
import { PermissionLevels } from '../types/commands.ts';
import { configs } from '../../configs.ts';

// The member using the command must be one of the bots dev team
botCache.permissionLevels.set(
	PermissionLevels.BOT_DEVS,
	// deno-lint-ignore require-await
	async (message) => configs.userIDs.botDevs.includes(message.author.id),
);
