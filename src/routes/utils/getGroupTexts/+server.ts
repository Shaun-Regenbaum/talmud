import { storeText, getText } from '$lib/sefaria';
import { groupTexts, getLength } from '$lib/textManipulation';
import { WholeBook as Book } from '$lib/MishnehTorah';
import { json } from '@sveltejs/kit';
import { redis, resetIndices } from '$lib/db';

export async function GET() {
	let status = [];
	try {
		await redis.connect();
		status.push('Redis connected');
		console.log('Redis connected');
	} catch {
		if (!redis.isOpen) {
			console.log("Redis didn't connect");
			throw Error("Redis didn't connect");
		}
		console.log('Redis already connected');
		status.push('Redis already connected');
	}
	await resetIndices();
	status.push('Reset indices');
	console.log('Reset indices');
	let singles = [];
	let groups = [];
	try {
		status.push('Length to iterate through' + String(Book.length));
		console.log('Length to iterate through' + String(Book.length));
		for (let i = 0; i < Book.length; i++) {
			console.log(`Working on ${i}/${Book.length}`);
			let length = await getLength(`Mishneh Torah, ${Book[Number(i)]}`);
			status.push(`There are ${length} parts for ${Book[i]}`);

			for (let j = 0; j < Number(length); j++) {
				singles.push(await getText(`Mishneh Torah, ${Book[i]}`, String(j + 1)));
				status.push(`Got text ${j} for ${Book[i]}`);
				console.log(`Got text ${j} of ${Book[i]}`);
				if (singles[j] === undefined) {
					console.log(`Got undefined for ${j} of ${Book[i]}`);
					status.push(`Got undefined for ${j} of ${Book[i]}`);
				}
				groups.push(await groupTexts(5, singles[j]));
				console.log(`Grouped text ${j} of ${Book[i]}`);
				status.push(`Grouped text ${j} of ${Book[i]}`);
			}
			console.log('Length of meta groups: ' + groups.length);
			for (let q = 0; q < groups.length; q++) {
				for (let w = 0; w < groups[q].length; w++) {
					await storeText(groups[q][w]);
					console.log(`Stored text ${q},${w} of ${Book[i]}`);
					status.push(`Stored text ${q},${w} of ${Book[i]}`);
				}
			}
			console.log(`Finished ${i}/${Book.length}`);
		}
	} catch (e) {
		let message = 'Unknown error';
		if (e instanceof Error) message = e.message;
		if (e instanceof Response) {
			message = e.statusText;
		}
		console.log(message);
		status.push(message);
	}
	await redis.quit();
	return json(status);
}
