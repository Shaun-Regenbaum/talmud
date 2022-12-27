import { storeText, getText } from '$lib/sefaria';
import { groupTexts, getLength } from '$lib/textManipulation';
import { SeferAhavah as Book } from '$lib/MishnehTorah';
import { json } from '@sveltejs/kit';
import { redis, resetIndices } from '$lib/db';

export async function GET() {
	let status = [];
	try {
		await redis.connect();
		status.push('Redis connected');
	} catch {
		if (!redis.isOpen) {
			console.log("Redis didn't connect");
			throw Error("Redis didn't connect");
		}
		status.push('Redis already connected');
	}
	await resetIndices();
	status.push('Reset indices');
	let singles = [];
	let groups = [];
	try {
		status.push('Length to iterate through' + String(Book.length));
		for (let i = 0; i < Book.length; i++) {
			let length = await getLength(`Mishneh Torah, ${Book[Number(i)]}`);
			status.push(`There are ${length} parts for ${Book[i]}`);

			for (let j = 1; j < Number(length); j++) {
				singles[j] = await getText(
					`Mishneh Torah, ${Book[i]}`,
					String(j),
					true
				);
				status.push(`Got text ${j} for ${Book[i]}`);
				groups[i] = await groupTexts(5, singles[j], true);
				status.push(`Grouped text ${j} of ${Book[i]}`);
			}
			for (let q = 0; q < groups.length; q++) {
				for (let w = 0; w < groups[q].length; w++) {
					await storeText(groups[q][w]);
					status.push(`Stored text ${w} of ${Book[i]}`);
				}
			}
		}
	} catch (e) {
		let message = 'Unknown error';
		if (e instanceof Error) message = e.message;
		if (e instanceof Response) {
			message = e.statusText;
		}
		status.push(message);
	}
	await redis.quit();
	return json(status);
}
