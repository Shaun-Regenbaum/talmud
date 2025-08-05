#!/bin/bash

# Run all three copy operations in parallel
echo "Starting parallel copy of all three folders..."

# Copy TD_L3_2_462861449
aws s3 cp s3://illumina-basespace-td/TD_L3_2_462861449/ s3://402-sequencing/td_4628614-48-49-50/TD_L3_2_462861449/ --recursive --only-show-errors &
PID1=$!

# Copy TD_L3_3_462861450
aws s3 cp s3://illumina-basespace-td/TD_L3_3_462861450/ s3://402-sequencing/td_4628614-48-49-50/TD_L3_3_462861450/ --recursive --only-show-errors &
PID2=$!

# Copy TD_L3_462861448
aws s3 cp s3://illumina-basespace-td/TD_L3_462861448/ s3://402-sequencing/td_4628614-48-49-50/TD_L3_462861448/ --recursive --only-show-errors &
PID3=$!

echo "Copy jobs started with PIDs: $PID1, $PID2, $PID3"
echo "Waiting for all copy operations to complete..."

# Wait for all background jobs to complete
wait $PID1
echo "TD_L3_2_462861449 copy completed"

wait $PID2
echo "TD_L3_3_462861450 copy completed"

wait $PID3
echo "TD_L3_462861448 copy completed"

echo "All copy operations completed!"

# Verify the copies
echo "Verifying copied folders..."
echo "TD_L3_2_462861449:"
aws s3 ls s3://402-sequencing/td_4628614-48-49-50/TD_L3_2_462861449/ --recursive | wc -l

echo "TD_L3_3_462861450:"
aws s3 ls s3://402-sequencing/td_4628614-48-49-50/TD_L3_3_462861450/ --recursive | wc -l

echo "TD_L3_462861448:"
aws s3 ls s3://402-sequencing/td_4628614-48-49-50/TD_L3_462861448/ --recursive | wc -l