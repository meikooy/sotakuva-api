// Load .env
require('dotenv').load();

const express = require('express');
const mongoose = require('mongoose');
const Image = require('./image');
const Kraken = require('kraken');


// Initialize Kraken
const kraken = new Kraken({
    'api_key': process.env.KRAKEN_API_KEY,
    'api_secret': process.env.KRAKEN_API_SECRET
});

// Connect mongoose
mongoose.connect(process.env.MONGODB_URI);
mongoose.Promise = global.Promise;

// Initialize express
const app = express();
const port = process.env.PORT || 3000;

// Sample route
app.get('/', function (req, res) {
	res.send('Rintamalla API');
});

// Image resizer url
app.get('/images/:id/file', function(req, res) {
	const id = req.params.id;

	// Validate size
	const size = req.query.size;
	const availableSizes = [
		'thumbnail',
		'large'
	];

	if (availableSizes.indexOf(size) === -1) {
		return res.status(400).send('Invalid size. Available sizes are ' + availableSizes.join(', '));
	}

	if (!id) {
		return res.status(400).send('Invalid id');	
	}

	console.log('find image ' + id);

	// Get image
	Image.findById(id).then(
		image => {

			const sizeKey = `s3_${size}_url`;

			// Check if size exists
			if (!image[sizeKey]) {

				console.log('pass to kraken');

				// 
				// Pass to kraken
				// 
				
				const resizes = {
					thumbnail: {
	        			height: 600,
	        			strategy: 'portrait'
	    			},
	    			large: {
	        			width: 1800,
	        			strategy: 'landscape'
	    			}
				};

				const params = {
				    url: image.image_url,
				    lossy: true,
				    resize: resizes[size],
				    s3_store: {
				        key: process.env.S3_KEY,
				        secret: process.env.S3_SECRET,
				        bucket: process.env.S3_BUCKET,
				        region: process.env.S3_REGION,
				        path: `images/${id}_${size}`
				    },
				    wait: true
				};
				kraken.url(params, function(status) {
					console.log('kraken status');
					console.log(status);

				    if (status.success) {
				        
				        // Save the optimized url
				        image[sizeKey] = status.kraked_url;
				        image.save().then(
				        	image => {

				        		// Redirect to optimized url
				        		res.redirect(301, image[sizeKey]);

				        	}, error => {
					        	console.log(error);
					        	res.status(500).send('Image saving failed');
				        	}
				        );

				    } else {
				    	console.log(status);
				    	res.status(500).send('Image resize failed. Error: ' + status.message);
				    }
				});

			}
			else {

				// Redirect to optimized url
				res.redirect(301, image[sizeKey]);

			}
		},
		error => {
			res.status(404).send('Image not found');
		}
	);

});

app.listen(port, function () {
  console.log('Example app listening on port ' + port);
});