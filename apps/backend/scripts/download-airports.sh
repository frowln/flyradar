#!/bin/bash
mkdir -p data
curl -sL https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat -o data/airports.dat
echo "Downloaded $(wc -l < data/airports.dat) airports"
